// Left panel: the open application's documents under five headings (spec 03 §2), in order,
// each collapsible. Clicking an item opens it in the centre.
import { Fragment, useState, type ReactNode } from "react";
import type { SectionKey } from "../state/layout";
import type { ApplicationView, SourceGroup, TreeItem } from "../state/workspace";
import { ChevronIcon, CloudIcon, FolderIcon, PanelLeftIcon, PlusIcon } from "./icons";

interface Props {
  view: ApplicationView;
  selected: string;
  sections: Record<SectionKey, boolean>;
  onToggleSection: (key: SectionKey) => void;
  onSelect: (id: string) => void;
  onCollapse: () => void;
}

export function LeftPanel({ view, selected, sections, onToggleSection, onSelect, onCollapse }: Props) {
  const items = (list: TreeItem[]) => (
    <div className="tree-items">
      {list.map((item) => (
        <TreeButton key={item.id} item={item} selected={selected === item.id} onSelect={onSelect} />
      ))}
    </div>
  );

  return (
    <nav className="left-panel" aria-label="Application contents" data-testid="left-panel">
      <div className="panel-head panel-head-end">
        <button type="button" className="icon-button" aria-label="Collapse left panel" onClick={onCollapse}>
          <PanelLeftIcon />
        </button>
      </div>
      <div className="tree">
        <Section id="grant" title={`${view.grant} documents`} open={sections.grant} onToggle={onToggleSection}>
          {items(view.grantDocs)}
        </Section>
        <Section id="workflow" title="Workflow documents" open={sections.workflow} onToggle={onToggleSection}>
          {items(view.workflow)}
        </Section>
        <Section id="deliverables" title="Deliverables" open={sections.deliverables} onToggle={onToggleSection}>
          <div className="tree-items">
            {view.deliverables.map((item) => (
              <TreeButton key={item.id} item={item} selected={selected === item.id} onSelect={onSelect} />
            ))}
            <div className="tree-inert">
              <span>Requests for information</span>
              <span className="tree-tag">Later</span>
            </div>
            {view.rfis.map((rfi) => (
              <div key={rfi} className="tree-inert tree-inert-sub">
                {rfi}
              </div>
            ))}
          </div>
        </Section>
        <Section
          id="sources"
          title="Source documents"
          open={sections.sources}
          onToggle={onToggleSection}
          addLabel="Add source documents"
        >
          <div className="tree-items">
            {view.sharepoint && (
              <SourceGroupView icon={<CloudIcon />} label="Linked · SharePoint" group={view.sharepoint}>
                {items(view.sharepoint.items)}
              </SourceGroupView>
            )}
            <SourceGroupView icon={<FolderIcon />} label="Local · this application" group={view.local}>
              {items(view.local.items)}
            </SourceGroupView>
          </div>
        </Section>
        <Section
          id="references"
          title="References and templates"
          open={sections.references}
          onToggle={onToggleSection}
          addLabel="Add references and templates"
        >
          {items(view.references)}
        </Section>
      </div>
    </nav>
  );
}

function TreeButton({ item, selected, onSelect }: { item: TreeItem; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      className="tree-item"
      aria-current={selected ? "page" : undefined}
      data-attention={item.attention || undefined}
      onClick={() => onSelect(item.id)}
    >
      <span className="tree-name">{item.name}</span>
      <span className="tree-tag">{item.tag}</span>
    </button>
  );
}

function SourceGroupView({
  icon,
  label,
  group,
  children,
}: {
  icon: ReactNode;
  label: string;
  group: SourceGroup;
  children: ReactNode;
}) {
  return (
    <div className="source-group">
      <div className="source-label">
        {icon}
        <span>{label}</span>
      </div>
      {group.path && <div className="source-path">{group.path}</div>}
      <div className="source-items">{children}</div>
    </div>
  );
}

function Section({
  id,
  title,
  open,
  onToggle,
  addLabel,
  children,
}: {
  id: SectionKey;
  title: string;
  open: boolean;
  onToggle: (key: SectionKey) => void;
  addLabel?: string;
  children: ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const bodyId = `tree-${id}`;
  return (
    <Fragment>
      <section className="tree-section" data-section={id}>
        <div className="tree-heading-row">
          <button
            type="button"
            className="tree-heading"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onToggle(id)}
          >
            <ChevronIcon open={open} />
            {title}
          </button>
          {addLabel && (
            <button
              type="button"
              className="icon-button icon-button-sm"
              aria-label={addLabel}
              aria-expanded={adding}
              onClick={() => setAdding((a) => !a)}
            >
              <PlusIcon />
            </button>
          )}
        </div>
        {addLabel && adding && open && <AddPopover label={addLabel} idPrefix={id} onDone={() => setAdding(false)} />}
        <div id={bodyId} className="tree-body" hidden={!open}>
          {children}
        </div>
      </section>
      {id !== "references" && <div className="tree-divider" aria-hidden="true" />}
    </Fragment>
  );
}

/** The + card: SharePoint folder URL or Upload files. Linking and uploading are WP-5's (F-03). */
function AddPopover({ label, idPrefix, onDone }: { label: string; idPrefix: string; onDone: () => void }) {
  const inputId = `${idPrefix}-sp-url`;
  return (
    <div
      className="add-card"
      role="dialog"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <label htmlFor={inputId} className="add-label">
        SharePoint folder URL
      </label>
      <input id={inputId} type="url" className="text-input" placeholder="https://contoso.sharepoint.com/sites/…" autoFocus />
      <button type="button" className="button button-primary" onClick={onDone}>
        Link folder
      </button>
      <div className="or-rule">
        <span />
        or
        <span />
      </div>
      <button type="button" className="button" onClick={onDone}>
        Upload files…
      </button>
    </div>
  );
}
