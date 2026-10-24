# Gaokao PDF Preview

The `exam-zh` option compiles the selected questions on the local server and
renders the resulting PDF with PDF.js. The Generate PDF action uses those same
bytes; it does not capture the HTML preview or download a source archive.
The general exam and handout templates keep their existing export path.

## Local Setup

Run `npm run latex:setup` once on a new machine, using Node 22.18+ or Node 24.
On Windows x64 this installs the pinned Tectonic 0.17.0 release, verifies its
SHA-256, and prepares the Chinese fonts and exam-zh dependencies. First setup
requires internet access and can take several minutes. No global TeX install
is required. Re-running the command is safe.

The compiler and resource cache live in `.local-tools/tectonic/` (git-ignored).
Keep this directory when restarting or deploying locally. On other platforms,
install Tectonic 0.17 and set `MOTI_TECTONIC_PATH` to its absolute executable path,
then run the same setup command. Both development and production need the
vendored files from `public/vendor/exam-zh/` or `.output/public/vendor/exam-zh/`.

Tectonic cache locations are explicitly configured using its documented
[`TECTONIC_CACHE_DIR`](https://tectonic-typesetting.github.io/book/latest/getting-started/first-document.html)
setting so setup and the running server use the same resources.

## Boundaries

- Requests contain validated question data, not arbitrary TeX documents.
- Prose is escaped; math commands and environments are allowlisted. Unsupported
  macros cause an actionable error rather than silent content loss.
- Images are embedded PNG/JPEG data, with signatures checked before compiling.
- Compilation uses `--untrusted --only-cached`, no shell, an isolated temporary
  directory, bounded requests/output, and a three-minute process timeout.
- Jobs are serialized, identical pending requests are shared, and the last
  three successful PDFs are cached in memory. A checksum-validated disk cache
  keeps at most 20 PDFs / 200 MB for seven days, keyed by generated TeX, images,
  warnings, and upstream revision. Temporary compilation files are removed.
- The arrange screen prewarms the initial Gaokao preview once. Browser requests
  share pending work and retain up to four results. Chinese character maps load
  on demand; PDF pages are rasterized near the viewport, preserving page sizes.
- Late responses cannot replace a newer preview. Settings changes invalidate
  the old download. Compilation errors show a retry action and never fall back
  silently to the general template.
- This remains a local application. Do not expose the existing unauthenticated
  local-user API publicly without adding authentication and resource isolation.

Upstream template sources remain unmodified and LPPL notices are retained in
`public/vendor/exam-zh/`. Question content and answers are not changed by export.
