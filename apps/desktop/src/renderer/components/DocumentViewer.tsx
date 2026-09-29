// Format-native, view-only document viewers (WP-2).
import { useEffect, useMemo, useRef, useState } from "react";
import type { RpcClient } from "@gw/shared";
import ExcelJS from "exceljs";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { SuperDoc } from "superdoc";
import "superdoc/style.css";
import type { TreeItem } from "../state/workspace";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ViewerHighlight {
  page?: number | null;
  bbox?: { x: number; y: number; width: number; height: number } | null;
  text?: string | null;
}

interface Props {
  applicationId: string;
  client: RpcClient | null;
  item: TreeItem;
  highlight?: ViewerHighlight | null;
}

type BytesState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; bytes: Uint8Array; mime: string }
  | { kind: "error"; message: string };

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function DocumentViewer({ applicationId, client, item, highlight = null }: Props) {
  const [state, setState] = useState<BytesState>({ kind: "idle" });
  const doc = item.document;

  useEffect(() => {
    let cancelled = false;
    if (!client || !doc) {
      setState({ kind: "idle" });
      return;
    }
    if (doc.status === "no-text" || doc.status === "error") {
      setState({
        kind: "error",
        message: doc.status === "no-text" ? "No readable text" : "Document unavailable",
      });
      return;
    }
    setState({ kind: "loading" });
    client
      .request("documents.read", { applicationId, documentId: item.id })
      .then(({ dataBase64, mime }) => {
        if (!cancelled) setState({ kind: "ready", bytes: decodeBase64(dataBase64), mime });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "Document unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, client, doc, item.id]);

  if (!doc) return <div className="page document-viewer-empty" data-testid="page" />;
  if (state.kind === "loading" || state.kind === "idle") {
    return <div className="page document-viewer-state" data-testid="document-viewer-loading">Loading…</div>;
  }
  if (state.kind === "error") {
    return <div className="page document-viewer-state" data-testid="document-viewer-error">{state.message}</div>;
  }
  if (state.kind !== "ready") {
    return <div className="page document-viewer-state" data-testid="document-viewer-loading">Loading…</div>;
  }

  switch (doc.format) {
    case "pdf":
      return <PdfViewer bytes={state.bytes} highlight={highlight} />;
    case "docx":
      return <DocxViewer bytes={state.bytes} name={item.name} highlight={highlight} />;
    case "xlsx":
      return <SpreadsheetViewer bytes={state.bytes} />;
    case "md":
      return <MarkdownViewer bytes={state.bytes} />;
    case "txt":
      return <TextViewer bytes={state.bytes} />;
  }
}

function PdfViewer({ bytes, highlight }: { bytes: Uint8Array; highlight: ViewerHighlight | null }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ data: bytes.slice() });
    task.promise
      .then((value) => {
        if (!cancelled) setPdf(value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [bytes]);

  if (error) return <div className="page document-viewer-state">PDF unavailable</div>;
  if (!pdf) return <div className="page document-viewer-state">Loading…</div>;
  return (
    <div className="pdf-viewer" data-testid="pdf-viewer">
      {Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} highlight={highlight} />
      ))}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  highlight,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  highlight: ViewerHighlight | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [overlay, setOverlay] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then((value) => {
      if (!cancelled) setPage(value);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas) return;
    const viewport = page.getViewport({ scale: 1.25 });
    const outputScale = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const render = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    });
    void render.promise.catch(() => undefined);

    if (highlight?.page === pageNumber && highlight.bbox) {
      const { x, y, width, height } = highlight.bbox;
      const [x1, y1] = viewport.convertToViewportPoint(x, y);
      const [x2, y2] = viewport.convertToViewportPoint(x + width, y + height);
      setOverlay({
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      });
    } else {
      setOverlay(null);
    }
    return () => {
      render.cancel();
    };
  }, [page, pageNumber, highlight]);

  const highlighted = highlight?.page === pageNumber;
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) wrapperRef.current?.scrollIntoView({ block: "center" });
  }, [highlighted]);

  return (
    <article ref={wrapperRef} className="pdf-page" data-page={pageNumber}>
      <div className="pdf-canvas-wrap">
        <canvas ref={canvasRef} />
        {overlay && <div className="pdf-highlight" data-testid="pdf-highlight" style={overlay} />}
      </div>
      <div className="viewer-page-number">{pageNumber}</div>
    </article>
  );
}

function DocxViewer({
  bytes,
  name,
  highlight,
}: {
  bytes: Uint8Array;
  name: string;
  highlight: ViewerHighlight | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    let disposed = false;
    const file = new File([bytes.slice()], name.endsWith(".docx") ? name : `${name}.docx`, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const instance = new SuperDoc({
      selector: host,
      document: file,
      documentMode: "viewing",
      telemetry: { enabled: false },
      onReady: () => {
        if (disposed) return;
      },
      onContentError: () => {
        if (!disposed) setError(true);
      },
      onException: () => {
        if (!disposed) setError(true);
      },
    });
    return () => {
      disposed = true;
      instance.destroy();
      host.replaceChildren();
    };
  }, [bytes, highlight?.text, name]);

  if (error) return <div className="page document-viewer-state">DOCX unavailable</div>;
  return <div ref={hostRef} className="docx-viewer" data-testid="docx-viewer" />;
}

type Sheet = { name: string; rows: string[][] };

function SpreadsheetViewer({ bytes }: { bytes: Uint8Array }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const workbook = new ExcelJS.Workbook();
    void workbook.xlsx
      .load(bytes.slice().buffer as ArrayBuffer)
      .then(() => {
        if (cancelled) return;
        const next = workbook.worksheets.map((sheet) => {
          const rows: string[][] = [];
          sheet.eachRow({ includeEmpty: false }, (row) => {
            const values = row.values;
            const cells = Array.isArray(values) ? values.slice(1).map((value) => (value == null ? "" : String(value))) : [];
            rows.push(cells);
          });
          return { name: sheet.name, rows };
        });
        setSheets(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  if (error) return <div className="page document-viewer-state">Spreadsheet unavailable</div>;
  if (!sheets) return <div className="page document-viewer-state">Loading…</div>;
  return (
    <div className="spreadsheet-viewer" data-testid="xlsx-viewer">
      {sheets.map((sheet) => (
        <section className="sheet-card" key={sheet.name}>
          <div className="sheet-title">{sheet.name}</div>
          <table>
            <tbody>
              {sheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th>{rowIndex + 1}</th>
                  {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

function TextViewer({ bytes }: { bytes: Uint8Array }) {
  return <article className="page flow-document" data-testid="txt-viewer"><pre>{decodeText(bytes)}</pre></article>;
}

function MarkdownViewer({ bytes }: { bytes: Uint8Array }) {
  const blocks = useMemo(() => decodeText(bytes).split(/\r?\n/), [bytes]);
  return (
    <article className="page flow-document" data-testid="md-viewer">
      {blocks.map((line, index) => <MarkdownLine key={index} line={line} />)}
    </article>
  );
}

function MarkdownLine({ line }: { line: string }) {
  const heading = /^(#{1,3})\s+(.+)$/.exec(line);
  if (heading) {
    const Tag = (`h${heading[1]!.length}`) as "h1" | "h2" | "h3";
    return <Tag>{heading[2]}</Tag>;
  }
  const bullet = /^[-*]\s+(.+)$/.exec(line);
  if (bullet) return <div className="viewer-bullet">• {bullet[1]}</div>;
  if (!line.trim()) return <br />;
  return <p>{line}</p>;
}
