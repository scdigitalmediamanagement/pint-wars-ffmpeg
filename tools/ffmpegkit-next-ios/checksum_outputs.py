#!/usr/bin/env python3
"""Write SHA256SUMS for all regular files in a workflow output directory."""

import hashlib
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: checksum_outputs.py OUTPUT_DIRECTORY")

    output_dir = Path(sys.argv[1]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    checksum_path = output_dir / "SHA256SUMS"
    lines = []
    for path in sorted(output_dir.rglob("*")):
        if path.is_file() and path != checksum_path:
            lines.append(f"{sha256_file(path)}  {path.relative_to(output_dir)}")
    checksum_path.write_text("\n".join(lines) + ("\n" if lines else ""))
    print(f"Wrote {len(lines)} SHA-256 checksums to {checksum_path}")


if __name__ == "__main__":
    main()