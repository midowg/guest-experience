import { FileText } from "lucide-react";
import { sizeLabel, type PraWamDocument } from "@/lib/pra-wam/documents";
import { praWamApi } from "@/lib/routes";
import base from "../pra-wam.module.css";
import own from "./home.module.css";

/** Documents as rows with a "Buka" link (Penpot E1 "Dokumen terbaru", E2 "Dokumen sesi"). */
export function DocRows({ documents, empty }: { documents: PraWamDocument[]; empty: string }) {
  if (!documents.length) return <p className={base.meta}>{empty}</p>;
  return <div>
    {documents.map(document => <div key={document.id} className={own.docRow}>
      <span className={base.tile}><FileText aria-hidden /></span>
      <span><strong>{document.title}</strong><span className={base.meta}>{sizeLabel(document.size)} · {document.sessionTitle ?? "dokumen umum acara"}</span></span>
      <a className={own.open} href={praWamApi.documents(document.id)} target="_blank" rel="noopener">Buka</a>
    </div>)}
  </div>;
}
