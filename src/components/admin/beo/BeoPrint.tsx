"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import { beoVersionInfo, beoVersionParam, type BeoDocument } from "@/lib/beo-document";
import { BeoSheets } from "@/components/admin/beo/BeoSheet";
import styles from "@/components/admin/beo/beo-print.module.css";
import { adminApi, adminEventPath } from "@/lib/routes";

/**
 * The BEO as printable A4 pages: the preparation sheet and the hosting brief, printed or saved as
 * PDF together. The supplier version (no full names, access needs or brief) is one link away.
 */
export function BeoPrint({ doc, eventId }: { doc: BeoDocument; eventId: string }) {
  const pdf = adminApi(eventId, "beo/pdf", { versi: beoVersionParam[doc.version] });
  const other = doc.version === "vendor" ? "internal" : "vendor";
  return <div className={styles.screen}>
    <div className={styles.toolbar}>
      <a href={adminEventPath(eventId, "beo")} className={styles.back}><ArrowLeft size={16} aria-hidden="true" /> Kembali ke BEO</a>
      <div className={styles.actions}>
        <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> {doc.version === "vendor" ? "Cetak" : "Cetak semua"}</button>
        <a href={pdf} download><Download size={16} aria-hidden="true" /> Unduh PDF</a>
      </div>
      <p className={styles.includes}>
        {beoVersionInfo[doc.version].includes}{" "}
        <a href={adminEventPath(eventId, "beo-print", { versi: beoVersionParam[other] })}>{other === "vendor" ? "Lihat versi penyedia" : "Kembali ke lembar lengkap"}</a>
      </p>
    </div>
    <BeoSheets doc={doc} />
  </div>;
}
