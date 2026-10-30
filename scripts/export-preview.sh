#!/usr/bin/env bash
# A static copy of the site for a private preview without a Node server: out/ (STATIC_EXPORT in next.config.ts).
# Usage: bash scripts/export-preview.sh   then serve out/ at the root of any static host, e.g.
#        python3 -m http.server 3300 --directory out   →   http://localhost:3300/
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf out
# the preview's host does not serve .glb: the factory's models go as an embedded glTF in a .json file (written below)
STATIC_EXPORT=1 NEXT_PUBLIC_SAMPLE_MODELS=/models/factory/sample.json npx next build
rm -f AGENTS.md # written by newer `next` versions; not part of the project
mkdir -p out/p
mv out/_next out/p/_next
# top-level RSC prefetch files and the not-found route: names a preview host may reserve; without them the client
# navigates by loading the next page (the project kept in sessionStorage goes with it)
rm -rf out/__next.*.txt out/_not-found
# a decoder in the bundle writes U+FFFD as a raw character inside string literals; the same character as an escape,
# so every file is plain text a strict host accepts (identical behaviour)
python3 - <<'PY'
import pathlib
for f in pathlib.Path("out").rglob("*.js"):
    s = f.read_text(encoding="utf-8")
    if "\ufffd" in s:
        f.write_text(s.replace("\ufffd", "\\ufffd"), encoding="utf-8")
PY
# the factory's models as an embedded glTF (JSON, the binary chunk as a base64 data URI): the same model, a served type
python3 - <<'PY'
import base64, json, pathlib, struct
src = pathlib.Path("out/models/factory/sample.glb")
data = src.read_bytes()
magic, version, length = struct.unpack_from("<4sII", data, 0)
assert magic == b"glTF", "not a GLB"
off, doc, binary = 12, None, b""
while off < length:
    size, kind = struct.unpack_from("<I4s", data, off)
    chunk = data[off + 8 : off + 8 + size]
    if kind == b"JSON":
        doc = json.loads(chunk)
    elif kind == b"BIN\x00":
        binary = chunk
    off += 8 + size
doc["buffers"][0]["uri"] = "data:application/octet-stream;base64," + base64.b64encode(binary).decode()
pathlib.Path("out/models/factory/sample.json").write_text(json.dumps(doc, separators=(",", ":")))
src.unlink()
PY
echo "static preview in out/ ($(du -sh out | cut -f1))"
