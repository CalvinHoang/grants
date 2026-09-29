// Centre: whatever is selected in the tree, by default the application draft (spec 03 §2).
// WP-1 provides the frame and the page; the viewers mount here (WP-2 documents, WP-3 the form).
import type { RpcClient } from "@gw/shared";
import type { TreeItem } from "../state/workspace";
import { DocumentViewer } from "./DocumentViewer";
import { PanelLeftIcon, PanelRightIcon } from "./icons";

interface Props {
  item: TreeItem | undefined;
  applicationId: string;
  client: RpcClient | null;
  leftOpen: boolean;
  rightOpen: boolean;
  onOpenLeft: () => void;
  onOpenRight: () => void;
}

export function Centre({ item, applicationId, client, leftOpen, rightOpen, onOpenLeft, onOpenRight }: Props) {
  return (
    <main className="centre" data-testid="centre" data-view={item?.id}>
      {!leftOpen && (
        <button type="button" className="icon-button edge-button edge-left" aria-label="Open left panel" onClick={onOpenLeft}>
          <PanelLeftIcon />
        </button>
      )}
      {!rightOpen && (
        <button
          type="button"
          className="icon-button edge-button edge-right"
          aria-label="Open right panel"
          onClick={onOpenRight}
        >
          <PanelRightIcon />
        </button>
      )}
      <div className="centre-scroll">
        {item && (
          <>
            <div className="doc-caption">{item.name}</div>
            <DocumentViewer applicationId={applicationId} client={client} item={item} />
          </>
        )}
      </div>
    </main>
  );
}
