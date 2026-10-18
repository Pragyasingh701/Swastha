import React, { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { getReportFileUrl, openReportFile } from "../../api/reports";

// What kind of preview a stored file supports, from the stored (unsigned)
// URL's extension.
function getFileKind(fileUrl) {
  if (!fileUrl) return null;
  const lower = String(fileUrl).toLowerCase();
  if (/\.pdf(\?|$)/.test(lower)) return "pdf";
  if (/\.(png|jpe?g|webp)(\?|$)/.test(lower)) return "image";
  return null;
}

// Shows a report's attached document. The file is never loaded from the
// stored URL directly: a short-lived signed URL is requested from the API
// (which checks the viewer is allowed to see this report) and that is what
// goes into the iframe / img. A stored value is therefore never put into
// the page as a URL by this component.
export default function ReportFilePreview({
  reportId,
  fileUrl,
  title,
  frameClassName = "w-full h-full rounded-xl border border-slate-200",
  frameStyle = { minHeight: 360 },
  imageClassName = "w-full h-full rounded-xl object-contain",
  linkLabel = "View original document",
  linkClassName = "mt-4 inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-blue-700 text-sm font-semibold transition-colors hover:bg-blue-100",
  messageClassName = "text-sm text-slate-500",
}) {
  const kind = getFileKind(fileUrl);
  const [state, setState] = useState({ status: "loading", url: null });
  const [openError, setOpenError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!reportId || !fileUrl || !kind) {
      setState({ status: "unsupported", url: null });
      return undefined;
    }
    setState({ status: "loading", url: null });
    getReportFileUrl(reportId)
      .then(({ url }) => {
        if (!cancelled) setState({ status: "ready", url });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, fileUrl, kind]);

  async function handleOpen() {
    setOpenError(false);
    try {
      await openReportFile(reportId);
    } catch {
      setOpenError(true);
    }
  }

  return (
    <>
      {state.status === "loading" && <p className={messageClassName}>Loading document…</p>}
      {state.status === "error" && <p className={messageClassName}>This document couldn't be loaded.</p>}
      {state.status === "unsupported" && <p className={messageClassName}>Preview not available for this file type.</p>}
      {state.status === "ready" && kind === "pdf" && (
        <iframe src={state.url} title="Document preview" className={frameClassName} style={frameStyle} />
      )}
      {state.status === "ready" && kind === "image" && (
        <img src={state.url} alt={title || "Uploaded document"} className={imageClassName} />
      )}

      {reportId && fileUrl && (
        <>
          <button type="button" onClick={handleOpen} className={linkClassName}>
            <FileText size={16} />
            {linkLabel}
          </button>
          {openError && <p className="mt-2 text-xs text-red-600">Couldn't open the document. Please try again.</p>}
        </>
      )}
    </>
  );
}
