"""Remove light solid backgrounds from public/characters PNG assets."""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "characters"
TOLERANCE = 38
FEATHER_TOLERANCE = 52


def background_colors(data: np.ndarray) -> np.ndarray:
    h, w = data.shape[:2]
    samples = [
        data[0, 0, :3],
        data[0, w - 1, :3],
        data[h - 1, 0, :3],
        data[h - 1, w - 1, :3],
        data[0, w // 2, :3],
        data[h - 1, w // 2, :3],
        data[h // 2, 0, :3],
        data[h // 2, w - 1, :3],
    ]
    return np.array(samples, dtype=np.float32)


def remove_background(path: Path) -> tuple[int, int]:
    image = Image.open(path).convert("RGBA")
    data = np.array(image)
    h, w = data.shape[:2]
    bg = background_colors(data)

    rgb = data[:, :, :3].astype(np.float32)
    dist_map = np.min(np.linalg.norm(rgb[:, :, None, :] - bg[None, None, :, :], axis=3), axis=2)
    is_bg = dist_map <= TOLERANCE

    visited = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        if is_bg[0, x]:
            visited[0, x] = True
            queue.append((x, 0))
        if is_bg[h - 1, x]:
            visited[h - 1, x] = True
            queue.append((x, h - 1))
    for y in range(h):
        if is_bg[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            queue.append((0, y))
        if is_bg[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h or visited[ny, nx] or not is_bg[ny, nx]:
                continue
            visited[ny, nx] = True
            queue.append((nx, ny))

    removed = int(visited.sum())
    data[visited, 3] = 0

    # Anti-aliased fringe: soften edge pixels that still look like background.
    near_bg = dist_map <= FEATHER_TOLERANCE
    opaque = data[:, :, 3] > 0
    has_transparent_neighbor = np.zeros((h, w), dtype=bool)
    has_transparent_neighbor[1:, :] |= data[:-1, :, 3] == 0
    has_transparent_neighbor[:-1, :] |= data[1:, :, 3] == 0
    has_transparent_neighbor[:, 1:] |= data[:, :-1, 3] == 0
    has_transparent_neighbor[:, :-1] |= data[:, 1:, 3] == 0
    fringe = opaque & near_bg & has_transparent_neighbor
    alpha_scale = np.clip((dist_map - TOLERANCE) / (FEATHER_TOLERANCE - TOLERANCE), 0, 1)
    data[fringe, 3] = np.minimum(
        data[fringe, 3],
        (alpha_scale[fringe] * 255).astype(np.uint8),
    )

    Image.fromarray(data).save(path)
    return removed, h * w


def main() -> None:
    files = sorted(ROOT.glob("*/*.png"))
    if not files:
        raise SystemExit(f"No PNG files under {ROOT}")

    print(f"Processing {len(files)} files...")
    for path in files:
        removed, total = remove_background(path)
        pct = removed / total * 100
        print(f"{path.relative_to(ROOT.parent.parent)}: {pct:.1f}% transparent")


if __name__ == "__main__":
    main()
