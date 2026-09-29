# Grant packages

One folder per grant round, named by its package id (for example `crcp-r19/`), laid out as in
`docs/spec/05-build-spec.md` §5.1:

```
<package id>/
  manifest.json
  documents/               the grant's documents; documents/application-form.docx is the form
  requirements-table.xlsx  ID · Exact guideline wording · Deliverable · Form field · Items from client
  form-map.json
  questions.json
  rules.json
```

The folder ships with the app (electron-builder `extraResources`). On start the engine installs each
package read-only into `<app data>/grants/<package id>/`, replacing it when `manifest.json`'s
`version` changes. A grant appears under New application once its package is here and complete.
