import { describe, expect, it } from "vitest";
import { minutesTelegramHtml } from "./minutes-message";
import { departmentGroups, groupTitle, installCommand, installLink, installReply, INSTALL_CODE, readUpdate, sampleMinutes, type TelegramUpdate } from "./telegram";

const BOT = "wam_werkudara_bot";
const CODE = "abcdefghijklmnopqrstuvwxyz012345";
const group = { id: -1001, type: "supergroup" as const, title: "Werkudara CoE · Center of Excellence", is_forum: true };
const update = (part: Omit<TelegramUpdate, "update_id">): TelegramUpdate => ({ update_id: 1, ...part });

describe("group names", () => {
  it("puts Werkudara and the short form first; a one-word department has none", () => {
    expect(groupTitle("Sales & Marketing", "SM")).toBe("Werkudara SM · Sales & Marketing");
    expect(groupTitle("Corporate", "Corporate")).toBe("Werkudara · Corporate");
    expect(departmentGroups(["Sales & Marketing", "Center of Excellence", "Corporate"]).map(item => item.groupTitle))
      .toEqual(["Werkudara CoE · Center of Excellence", "Werkudara · Corporate", "Werkudara SM · Sales & Marketing"]);
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
  });
});

describe("sampleMinutes", () => {
  it("is marked UJI COBA, names placeholders, and fits one message", () => {
    const now = new Date("2026-11-12T04:38:00Z");
    const sample = sampleMinutes({ scope: "departemen", department: "Center of Excellence" }, "CoE", now, "journey.werkudara.group/wam");
    expect(sample.trial).toBe(true);
    expect(sample.date).toBe("2026-11-12");
    expect(sample.actions[0].dueDate).toBe("2026-11-20");
    const { html, trimmed } = minutesTelegramHtml(sample);
    expect(trimmed).toBe(false);
    expect(html).toContain("📝 <b>MoM · CoE · Review alur kerja tim</b>");
    expect(html).toContain("UJI COBA");
    expect(sampleMinutes({ scope: "hod", department: null }, "", now, "x").departmentShort).toBe("HOD");
  });
});
