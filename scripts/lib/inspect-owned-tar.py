"""Read an owned storage tar from a private pipe. Never extract or open host files."""
import hashlib
import io
import json
import pathlib
import sys
import tarfile

LIMIT = 64 * 1024 * 1024


def inspect_archive(data):
    if not data or len(data) > LIMIT:
        raise ValueError("archive_size")
    files = []
    seen = set()
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
        for item in archive:
            if len(seen) >= 4096 or len(item.name.encode("utf-8")) > 1024:
                raise ValueError("entry_limit")
            if "\\" in item.name or any(ord(c) < 32 for c in item.name):
                raise ValueError("unsafe_path")
            path = pathlib.PurePosixPath(item.name)
            if path.is_absolute() or ".." in path.parts or ":" in item.name:
                raise ValueError("unsafe_path")
            name = str(path)
            if name in seen or not (item.isdir() or item.isfile()) or item.mode & 0o7000:
                raise ValueError("unsafe_entry")
            seen.add(name)
            if name != "." and (not path.parts or path.parts[0] != "winesnap-owned"):
                raise ValueError("foreign_tenant")
            if item.isfile():
                total += item.size
                if item.size < 0 or total > LIMIT:
                    raise ValueError("expanded_size")
                stream = archive.extractfile(item)
                digest = hashlib.sha256()
                size = 0
                while chunk := stream.read(1024 * 1024):
                    size += len(chunk)
                    digest.update(chunk)
                if size != item.size:
                    raise ValueError("truncated_entry")
                files.append({"path": name, "bytes": size, "sha256": digest.hexdigest()})
    return sorted(files, key=lambda item: item["path"])


if __name__ == "__main__":
    try:
        result = inspect_archive(sys.stdin.buffer.read(LIMIT + 1))
        sys.stdout.write(json.dumps(result, separators=(",", ":")))
    except Exception:
        sys.stderr.write("owned_storage_archive_rejected\n")
        sys.exit(1)
