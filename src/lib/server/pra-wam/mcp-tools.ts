import "server-only";
import { bookingWhere, clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { methodLabels } from "@/lib/pra-wam/attendance";
import { accountLabels, percent } from "@/lib/pra-wam/bod";
import { sizeLabel } from "@/lib/pra-wam/documents";
import { argChoice, argDate, argText, argUuid, McpInvalidParams, mcpToolSpecs, type McpTool } from "@/lib/pra-wam/mcp";
import type { Reader, RecapBody } from "@/lib/pra-wam/recap";
import { requestStatusLabels } from "@/lib/pra-wam/requests";
import { managesApp, managesSessions, readsNeeds, roleLabels } from "@/lib/pra-wam/roles";
import { sessionKindLabels, sessionStatusLabels, type Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { myNotifications, sentAnnouncements } from "./announcements";
import { daySchedule, listPeople } from "./appraisal";
import { attendance } from "./attendance";
import { bodInsights } from "./bod-insights";
import { bodPeople, bodProfile, bodSummary } from "./dashboard";
import { listDocuments } from "./documents";
import { currentForm } from "./questionnaire";
import { participationOf, recapOf } from "./recap";
import { allRequests, openRequestCount } from "./requests";
import type { Member } from "./session";
import { getSession, listSessions } from "./sessions";

/*
 * What each MCP WAM tool answers, as the key's owner: the same server functions the pages use, so
 * the app's own rules apply (a peserta sees only their own sessions, BOD reads the survey without
 * "Hanya dibaca fasilitator" answers and without Data HR). Plain, compact data: names, WIB times,
 * counts. Never a file key, a download address, or an email.
 */

type Data = Record<string, unknown>;
type Runner = (args: Record<string, unknown>, member: Member) => Promise<Data>;

/* ---- Times in WIB ------------------------------------------------------------------------------- */

const at = (iso: string) => `${dayLabel(wibDate(iso))} ${wibDate(iso).slice(0, 4)}, ${clockLabel(wibTime(iso))} WIB`;
const hours = (startsAt: string, endsAt: string) => `${clockLabel(wibTime(startsAt))}–${clockLabel(wibTime(endsAt))} WIB`;

/** The date and hours of a session; a draft without hours shows its planned dates. */
function sessionTime(session: Session): Data {
  if (session.startsAt && session.endsAt) return { tanggal: wibDate(session.startsAt), hari: dayLabel(wibDate(session.startsAt)), jam: hours(session.startsAt, session.endsAt) };
  if (session.planFrom) return { rencana: session.planTo && session.planTo !== session.planFrom ? `${session.planFrom} s.d. ${session.planTo}` : session.planFrom, jam: "belum dijadwalkan" };
  return { jam: "belum dijadwalkan" };
}
const sessionDate = (session: Session) => session.startsAt ? wibDate(session.startsAt) : session.planFrom;
const place = (session: Session) => session.roomName ?? (session.location || null);

const sessionRow = (session: Session): Data => ({
  id: session.id, judul: session.title, jenis: sessionKindLabels[session.kind], status: sessionStatusLabels[session.status],
  ...sessionTime(session), tempat: place(session), peserta: session.participantCount, saya_peserta: session.isParticipant,
});

/* ---- Runners ------------------------------------------------------------------------------------ */

const runners: Record<string, Runner> = {
  async ringkasan(_args, member) {
    const [summary, wider] = await Promise.all([bodSummary(member), bodInsights(member)]);
    return {
      peserta_aktif: summary.people, departemen: summary.departments, business_unit: summary.businessUnits,
      akun: { aktif: summary.accounts, sudah_pernah_masuk: summary.signedIn },
      sesi: { terbit: summary.published, draf: summary.drafts },
      permintaan_jadwal_menunggu: summary.openRequests,
      forum_aktif: summary.active ? {
        judul: summary.active.title, mulai: at(summary.active.startsAt), sedang_berjalan: summary.active.live,
        hadir: summary.active.present, diundang: summary.active.expected, persen: percent(summary.active.present, summary.active.expected),
      } : null,
      perlu_perhatian: summary.attention.map(item => ({ judul: item.title, rincian: item.detail })),
      fase: wider.phase ? { nama: wider.phase.name, hari_ke: wider.phase.day, dari_hari: wider.phase.days, hari_menuju_wam: wider.phase.daysToWam } : null,
      kehadiran_per_forum: summary.forums.map(forum => ({ judul: forum.title, mulai: at(forum.startsAt), hadir: forum.present, diundang: forum.expected, persen: percent(forum.present, forum.expected) })),
      akun_masuk_7_hari: wider.signedInWeek,
      pemakaian_aplikasi_per_departemen: wider.adoption.map(row => ({ departemen: row.name, peserta: row.people, pernah_masuk: row.signedIn })),
      per_business_unit: wider.businessUnits.map(unit => ({ bu: unit.name, peserta: unit.people, pernah_masuk: unit.signedIn })),
      pemakaian_ruang_3_minggu: wider.rooms ? {
        total_pemakaian: wider.rooms.total, total_jam: wider.rooms.hours, di_luar_kantor: wider.rooms.outside,
        per_hari: wider.rooms.days.map(day => ({ tanggal: day.date, booking: day.bookings, sesi: day.sessions, jam: day.hours })),
        ruang_tersibuk: wider.rooms.rooms.slice(0, 8).map(room => ({ ruang: room.name, dipakai: room.uses, jam: room.hours })),
      } : null,
      cara_absen: wider.checkIns?.map(item => ({ cara: methodLabels[item.way], jumlah: item.count })) ?? null,
      sesi_per_jenis: wider.sessions.map(row => ({ jenis: sessionKindLabels[row.kind], terbit: row.published, draf: row.drafts, batal: row.cancelled })),
      agenda_berikutnya: wider.upcoming.map(session => ({ judul: session.title, mulai: at(session.startsAt), tempat: session.where || null, peserta: session.participants })),
      permintaan_jadwal: wider.requests,
      meeting_hod: wider.hod,
      pengumuman: wider.announcements ? { terkirim: wider.announcements.sent, penerima: wider.announcements.recipients, dibaca: wider.announcements.read } : null,
      dokumen: wider.documents ? { total: wider.documents.total, umum: wider.documents.general, materi_sesi: wider.documents.perSession } : null,
      ...(summary.attendanceReady ? {} : { catatan: "Data kehadiran belum tersedia (menunggu migrasi absen)." }),
    };
  },

  async daftar_sesi(args, member) {
    const status = argChoice(args, "status", ["draf", "terbit", "batal"] as const);
    const from = argDate(args, "dari"), to = argDate(args, "sampai");
    if (from && to && from > to) throw new McpInvalidParams("dari tidak boleh setelah sampai.");
    const { sessions, migrated } = await listSessions(member);
    const chosen = sessions.filter(session => {
      if (status && session.status !== status) return false;
      const date = sessionDate(session);
      if ((from || to) && !date) return false;
      return (!from || date! >= from) && (!to || date! <= to);
    });
    return {
      jumlah: chosen.length, ditampilkan: Math.min(chosen.length, 100),
      sesi: chosen.slice(0, 100).map(sessionRow),
      ...(migrated ? {} : { catatan: "Sesi menunggu migrasi database." }),
    };
  },

  async detail_sesi(args, member) {
    const session = await getSession(argUuid(args, "id", true), member);
    return {
      ...sessionRow(session),
      deskripsi: session.description || null,
      dari_booking: session.booking ? `Dipesan ${session.booking.bookedBy.name}` : null,
      daftar_peserta: session.participants?.map(person => ({ nama: person.name, departemen: person.department || null })) ?? null,
    };
  },

  async kehadiran_per_departemen(_args, member) {
    const summary = await bodSummary(member);
    if (!summary.attendanceReady) return { catatan: "Data kehadiran belum tersedia (menunggu migrasi absen).", forum: [], departemen: [] };
    return {
      catatan: "Hanya forum terbit yang sudah dimulai. Persen = hadir dari diundang.",
      forum: summary.forums.map(forum => ({ judul: forum.title, mulai: at(forum.startsAt), sedang_berjalan: forum.live, hadir: forum.present, diundang: forum.expected, persen: percent(forum.present, forum.expected) })),
      departemen: summary.units.map(unit => ({
        nama: unit.name, business_unit: unit.businessUnits, anggota: unit.members, lead: unit.leads,
        hadir: unit.present, diundang: unit.expected, persen: percent(unit.present, unit.expected),
      })),
    };
  },

  async daftar_hadir(args, member) {
    const sessionId = argUuid(args, "sesi_id", true);
    const [session, rows] = await Promise.all([getSession(sessionId, member), attendance(sessionId, member)]);
    const present = rows.filter(row => row.checkedInAt);
    return {
      sesi: session.title, ...sessionTime(session), hadir: present.length, diundang: session.participantCount,
      orang: rows.map(row => ({
        nama: row.name, departemen: row.department || null, hadir: !!row.checkedInAt,
        jam_masuk: row.checkedInAt ? at(row.checkedInAt) : null, cara: row.method ? methodLabels[row.method] : null,
      })),
    };
  },

  async daftar_peserta(args) {
    const wanted = argText(args, "departemen")?.toLowerCase() ?? null;
    const { groups, total } = await bodPeople();
    const chosen = wanted ? groups.filter(group => group.name.toLowerCase().includes(wanted)) : groups;
    return {
      total_peserta: total,
      departemen: chosen.map(group => ({
        nama: group.name, business_unit: group.businessUnits, lead: group.leads, jumlah: group.people.length,
        orang: group.people.map(person => ({ id: person.id, nama: person.name, jabatan: person.jobTitle || null, lead: person.isLead, akun: accountLabels[person.account] })),
      })),
    };
  },

  async profil_peserta(args, member) {
    const profile = await bodProfile(member, argUuid(args, "id", true));
    if (!profile) throw new ServiceError(404, "Peserta tidak ditemukan.");
    const marks = { hadir: "Hadir", "tidak-hadir": "Tidak hadir", berlangsung: "Sedang berlangsung" } as const;
    return {
      nama: profile.name, departemen: profile.department || null, jabatan: profile.position || null,
      peran: ["Peserta", ...profile.roles.map(role => roleLabels[role])], akun: accountLabels[profile.account],
      unit: profile.units.map(unit => ({ nama: unit.name, jenis: unit.kind === "bu" ? "BU" : "Departemen", jabatan: unit.jobTitle || null, lead: unit.isLead })),
      forum: profile.attendanceReady ? profile.forums.map(forum => ({ judul: forum.title, kehadiran: marks[forum.mark] })) : null,
      forum_mendatang: profile.upcoming,
      ...(profile.attendanceReady ? {} : { catatan: "Data kehadiran belum tersedia." }),
    };
  },

  async booking_ruang(args, member) {
    const date = argDate(args, "tanggal", true);
    const { rooms, bookings } = await daySchedule(date, member);
    return {
      tanggal: date, hari: dayLabel(date),
      ruang: rooms.map(room => ({ nama: room.name, kapasitas: room.capacity, bisa_dipesan: room.bookable })),
      pemakaian: bookings.map(booking => ({
        tempat: bookingWhere(booking, rooms), jam: hours(booking.startsAt, booking.endsAt), judul: booking.title,
        jenis: booking.isSession ? "Sesi Pra WAM" : "Booking", dipesan: booking.bookedBy.name || null,
        peserta: booking.participants?.map(person => person.name) ?? null,
      })),
    };
  },

  async dokumen(args, member) {
    const sessionId = argUuid(args, "sesi_id");
    const { documents, migrated } = await listDocuments(member, sessionId ?? undefined);
    return {
      jumlah: documents.length,
      dokumen: documents.slice(0, 100).map(doc => ({
        judul: doc.title, berkas: doc.filename, ukuran: sizeLabel(doc.size), sesi: doc.sessionTitle ?? "Umum", diunggah: doc.uploadedBy, tanggal: at(doc.createdAt),
      })),
      catatan: migrated ? "Unduh dokumen lewat halaman Dokumen di aplikasi WAM." : "Dokumen menunggu migrasi database.",
    };
  },

  async permintaan_jadwal(_args, member) {
    if (!managesSessions(member)) {
      return { menunggu_panitia: await openRequestCount(), catatan: "Rincian permintaan jadwal hanya untuk panitia; yang terlihat di sini jumlahnya." };
    }
    const { open, done } = await allRequests(member);
    const row = (request: (typeof open)[number]) => ({
      sesi: request.sessionTitle, peminta: request.requester, status: requestStatusLabels[request.status],
      dari: hours(request.fromStartsAt, request.fromEndsAt) + ` · ${wibDate(request.fromStartsAt)}`,
      ke: hours(request.toStartsAt, request.toEndsAt) + ` · ${wibDate(request.toStartsAt)}`,
      ruang_baru: request.toRoomName, alasan: request.reason || null, catatan_panitia: request.reviewNote || null, diajukan: at(request.createdAt),
    });
    return { menunggu: open.length, menunggu_panitia: open.map(row), selesai_terakhir: done.map(row) };
  },

  async pengumuman(_args, member) {
    if (managesSessions(member)) {
      const { items } = await sentAnnouncements(member);
      return {
        terkirim: items.slice(0, 30).map(item => ({ judul: item.title, isi: item.body, untuk: item.audienceLabel, dikirim: at(item.createdAt), penerima: item.recipients, sudah_dibaca: item.read })),
      };
    }
    const { items, unread } = await myNotifications(member);
    return {
      belum_dibaca: unread,
      diterima: items.slice(0, 30).map(item => ({ judul: item.title, isi: item.body, dikirim: at(item.createdAt), dibaca: !!item.readAt })),
    };
  },

  async hasil_survei(args, member) {
    const section = argText(args, "bagian")?.toLowerCase() ?? null;
    const asked = argText(args, "departemen");
    const form = await currentForm().catch(() => null);
    if (!form || (form.status === "draf" && !managesApp(member))) return { catatan: "Belum ada survei yang dibuka." };
    // The department exactly as Data karyawan spells it, whatever the case it was asked in.
    const department = asked ? (await listPeople()).map(person => person.department).find(name => name?.toLowerCase() === asked.toLowerCase()) ?? null : null;
    if (asked && !department) throw new McpInvalidParams(`Departemen "${asked}" tidak dikenal. Kosongkan untuk semua departemen.`);
    const reader: Reader = { hrOpen: false, facilitator: readsNeeds(member) };
    const [recap, participation] = await Promise.all([recapOf(form, reader, department), participationOf(form).catch(() => null)]);
    const sections = section ? recap.sections.filter(item => item.key.toLowerCase() === section || item.title.toLowerCase().includes(section)) : recap.sections;
    return {
      survei: form.name, catatan: "Tanpa nama. Pertanyaan khusus HR dan jawaban \"Hanya dibaca fasilitator\" tidak ikut kecuali kamu berhak.",
      partisipasi: participation ? { selesai: participation.done, peserta_aktif: participation.active, persen: percent(participation.done, participation.active) } : null,
      departemen: recap.department, pilihan_departemen: recap.departments,
      bagian: sections.map(item => ({
        kunci: item.key, judul: item.title, anonim: item.anonymous,
        ...(item.notSplit ? { catatan: "Bagian anonim tidak dipecah per departemen." } : {}),
        pertanyaan: item.items.map(question => ({ pertanyaan: question.prompt, dijawab: question.answered, ...summaryOf(question.body) })),
      })),
    };
  },
};

/** One question's answers in plain words. */
function summaryOf(body: RecapBody): Data {
  switch (body.type) {
    case "bars": return { pilihan: body.bars.map(bar => ({ jawaban: bar.label, jumlah: bar.count })), ...(body.rest ? { lainnya: body.rest } : {}) };
    case "matrix": return { skala: body.scale, baris: body.rows.map(row => ({ butir: row.label, jumlah: row.counts })) };
    case "quotes": return { kutipan: body.quotes.slice(0, 15).map(quote => quote.count > 1 ? `${quote.text} (×${quote.count})` : quote.text) };
    case "needs-hr": return { ringkasan: "Hanya untuk HR." };
    case "few": return { ringkasan: "Jawaban terlalu sedikit untuk ditampilkan tanpa bisa ditebak orangnya." };
    default: return { ringkasan: "Belum ada jawaban." };
  }
}

/** Every tool with what it runs. */
export const mcpTools: McpTool<Member>[] = mcpToolSpecs.map(spec => {
  const run = runners[spec.name];
  if (!run) throw new Error(`MCP tool tanpa isi: ${spec.name}`);
  return { ...spec, run };
});
