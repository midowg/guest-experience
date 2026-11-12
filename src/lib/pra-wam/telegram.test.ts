import { describe, expect, it } from "vitest";
import { minutesCaption } from "./minutes-message";
import { cosTitle, departmentGroups, groupTitle, installCommand, installLink, installReply, INSTALL_CODE, momTargets, privateLink, readUpdate, sampleMinutes, type TelegramGroup, type TelegramUpdate } from "./telegram";

const BOT = "wam_werkudara_bot";
const CODE = "abcdefghijklmnopqrstuvwxyz012345";
const group = { id: -1001, type: "supergroup" as const, title: "Werkudara CoE · Center of Excellence", is_forum: true };
const update = (part: Omit<TelegramUpdate, "update_id">): TelegramUpdate => ({ update_id: 1, ...part });

describe("group names", () => {
  it("names a group WG and the short form; a one-word department by its name", () => {
    expect(groupTitle("Sales & Marketing", "SM")).toBe("WG SM");
    expect(groupTitle("Corporate", "Corporate")).toBe("WG Corporate");
    expect(departmentGroups(["Sales & Marketing", "Center of Excellence", "Corporate"]).map(item => item.groupTitle))
      .toEqual(["WG CoE", "WG Corporate", "WG SM"]);
  });

  it("gives a department with teams one group per team and none of its own", () => {
    expect(groupTitle("Sales & Marketing", "SM", "Business Solutions")).toBe("WG SM · Business Solutions");
    const rows = departmentGroups(["Sales & Marketing", "Center of Excellence"], { "Sales & Marketing": ["Commercial", "Business Solutions", " Commercial "] });
    expect(rows.map(row => [row.name, row.unit, row.groupTitle])).toEqual([
      ["Center of Excellence", null, "WG CoE"],
      ["Sales & Marketing", "Business Solutions", "WG SM · Business Solutions"],
      ["Sales & Marketing", "Commercial", "WG SM · Commercial"],
    ]);
  });

  it("makes the link that adds the bot with the rights it needs, and the command for a group it is in", () => {
    expect(INSTALL_CODE.test(CODE)).toBe(true);
    expect(installLink(BOT, CODE)).toBe(`https://t.me/${BOT}?startgroup=${CODE}&admin=delete_messages+pin_messages+invite_users+manage_topics`);
    expect(installCommand(BOT, CODE)).toBe(`/start@${BOT} ${CODE}`);
  });
});

describe("readUpdate", () => {
  it("reads an install from /start with a code, with or without the bot's name", () => {
    expect(readUpdate(update({ message: { chat: group, text: `/start@${BOT} ${CODE}` } }), BOT))
      .toEqual({ kind: "install", chat: { id: -1001, title: group.title, isForum: true }, code: CODE });
    expect(readUpdate(update({ message: { chat: { ...group, type: "group", is_forum: undefined }, text: `/start ${CODE}` } }), "WAM_Werkudara_Bot"))
      .toMatchObject({ kind: "install", code: CODE, chat: { isForum: false } });
  });

  it("ignores another bot's /start, a bare /start and ordinary chatter in a group", () => {
    expect(readUpdate(update({ message: { chat: group, text: `/start@other_bot ${CODE}` } }), BOT)).toEqual({ kind: "ignore" });
    expect(readUpdate(update({ message: { chat: group, text: "/start" } }), BOT)).toEqual({ kind: "ignore" });
    expect(readUpdate(update({ message: { chat: group, text: "halo semua" } }), BOT)).toEqual({ kind: "ignore" });
    expect(readUpdate(update({}), BOT)).toEqual({ kind: "ignore" });
  });

  it("follows a group that became a supergroup, and the bot's place in a group", () => {
    expect(readUpdate(update({ message: { chat: { id: -5, type: "group", title: "x" }, migrate_to_chat_id: -1005 } }), BOT)).toEqual({ kind: "migrate", from: -5, to: -1005 });
    const status = (value: string) => readUpdate(update({ my_chat_member: { chat: group, new_chat_member: { status: value } } }), BOT);
    expect(status("administrator")).toMatchObject({ kind: "bot-status", status: "admin" });
    expect(status("member")).toMatchObject({ kind: "bot-status", status: "anggota" });
    expect(status("kicked")).toMatchObject({ kind: "bot-status", status: "dikeluarkan" });
    expect(status("left")).toMatchObject({ kind: "bot-status", status: "dikeluarkan" });
  });

  it("ties the CoS's own chat from /start with a code, and follows a block or unblock there", () => {
    const chat = { id: 42, type: "private" as const, first_name: "Rina", last_name: "Putri" };
    expect(readUpdate(update({ message: { chat, text: `/start ${CODE}` } }), BOT))
      .toEqual({ kind: "install", chat: { id: 42, title: "CoS · Rina Putri", isForum: false, private: true }, code: CODE });
    expect(readUpdate(update({ my_chat_member: { chat, new_chat_member: { status: "kicked" } } }), BOT)).toMatchObject({ kind: "bot-status", status: "dikeluarkan" });
    expect(readUpdate(update({ my_chat_member: { chat, new_chat_member: { status: "member" } } }), BOT)).toMatchObject({ kind: "bot-status", status: "admin" });
    expect(cosTitle("", "")).toBe("CoS · tanpa nama");
    expect(privateLink(BOT, CODE)).toBe(`https://t.me/${BOT}?start=${CODE}`);
  });

  it("answers any private message with the help text", () => {
    expect(readUpdate(update({ message: { chat: { id: 42, type: "private" }, text: "/start" } }), BOT)).toEqual({ kind: "help", chatId: 42 });
    expect(readUpdate(update({ message: { chat: { id: 42, type: "private" }, text: "halo" } }), BOT)).toEqual({ kind: "help", chatId: 42 });
  });
});

describe("installReply", () => {
  it("escapes the department, as Telegram's HTML rules ask", () => {
    expect(installReply({ scope: "departemen", department: "Sales & Marketing", topic: 7, isForum: true }))
      .toBe("✅ Grup ini terpasang di WAM untuk MoM Sales &amp; Marketing. MoM akan masuk ke topik 📝 MoM.");
    expect(installReply({ scope: "hod", department: null, topic: null, isForum: false })).toBe("✅ Grup ini terpasang di WAM untuk MoM meeting antar HOD.");
    expect(installReply({ scope: "departemen", department: "Accounting", topic: null, isForum: true })).toContain("hak Kelola topik");
    expect(installReply({ scope: "cos", department: null, topic: null, isForum: false })).toContain("diteruskan ke BOD");
  });
});

describe("sampleMinutes", () => {
  it("is marked UJI COBA, names placeholders and its team, and has a code of its own", () => {
    const now = new Date("2026-11-12T04:38:00Z");
    const sample = sampleMinutes({ scope: "departemen", department: "Center of Excellence", unit: null, chatId: "-1004445165356" }, "CoE", now, "journey.werkudara.group/wam");
    expect(sample.trial).toBe(true);
    expect(sample.date).toBe("2026-11-12");
    expect(sample.code).toBe("CoE-20261112-UJI6");
    expect(sample.actions[0].dueDate).toBe("2026-11-20");
    const caption = minutesCaption(sample);
    expect(caption).toContain("📝 <b>MoM · CoE · Review alur kerja tim</b>");
    expect(caption).toContain("UJI COBA");
    expect(sampleMinutes({ scope: "departemen", department: "Sales & Marketing", unit: "Commercial", chatId: "-1" }, "SM", now, "x").department).toBe("Sales & Marketing · Commercial");
    expect(sampleMinutes({ scope: "hod", department: null, unit: null, chatId: "-2" }, "", now, "x").departmentShort).toBe("HOD");
  });
});

describe("momTargets", () => {
  const group = (chatId: string, scope: TelegramGroup["scope"], department: string | null, unit: string | null, botStatus: TelegramGroup["botStatus"] = "admin"): TelegramGroup =>
    ({ chatId, title: chatId, scope, department, unit, isForum: true, momTopicId: 1, botStatus, installedAt: "" });
  const groups = [
    group("coe", "departemen", "Center of Excellence", null), group("bs", "departemen", "Sales & Marketing", "Business Solutions"),
    group("com", "departemen", "Sales & Marketing", "Commercial"), group("cmc", "departemen", "Sales & Marketing", "Corporate Marketing Communication"),
    group("hod", "hod", null, null), group("gone", "departemen", "Accounting", null, "dikeluarkan"), group("cos", "cos", null, null),
  ];
  const ids = (list: TelegramGroup[]) => list.map(item => item.chatId).sort();

  it("sends a Meeting HOD or ITEM only to the HOD group", () => {
    expect(ids(momTargets(groups, [{ department: "Center of Excellence", unit: "" }], true))).toEqual(["hod"]);
  });

  it("sends to each participant's department or team once", () => {
    expect(ids(momTargets(groups, [
      { department: "Center of Excellence", unit: "" }, { department: "center of excellence", unit: "" }, { department: "Sales & Marketing", unit: "Commercial" },
    ], false))).toEqual(["coe", "com"]);
  });

  it("puts a head without a team (the GM of a department split into teams) in all its team groups", () => {
    expect(ids(momTargets(groups, [{ department: "Sales & Marketing", unit: "" }], false))).toEqual(["bs", "cmc", "com"]);
  });

  it("also sends a meeting with a BOD member to the CoS, who forwards it to the BOD", () => {
    expect(ids(momTargets(groups, [{ department: "Center of Excellence", unit: "" }], false, true))).toEqual(["coe", "cos"]);
    expect(ids(momTargets(groups, [{ department: "Center of Excellence", unit: "" }], true, true))).toEqual(["cos", "hod"]);
    expect(ids(momTargets(groups, [{ department: "Center of Excellence", unit: "" }], false, false))).toEqual(["coe"]);
    expect(momTargets([group("cos", "cos", null, null, "dikeluarkan")], [], false, true)).toEqual([]);
  });

  it("skips groups the bot was removed from, and departments with no group", () => {
    expect(momTargets(groups, [{ department: "Accounting", unit: "" }, { department: "Corporate", unit: "" }], false)).toEqual([]);
  });
});
