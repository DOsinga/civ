import json
import math
import random
from collections import Counter
from typing import Any

from projects.common import Project

# Map dimensions
MAP_WIDTH = 80
MAP_HEIGHT = 50

# Terrain types (matching original Civ 1)
TERRAIN_OCEAN = 0
TERRAIN_GRASSLAND = 1
TERRAIN_PLAINS = 2
TERRAIN_DESERT = 3
TERRAIN_FOREST = 4
TERRAIN_HILLS = 5
TERRAIN_MOUNTAINS = 6
TERRAIN_TUNDRA = 7
TERRAIN_ARCTIC = 8
TERRAIN_SWAMP = 9
TERRAIN_JUNGLE = 10

# Map generation parameters
OCEAN_PERCENT = 60
MOUNTAIN_PERCENT = 1.2
HILLS_PERCENT = 2.2
NUM_CONTINENTS = 12

# Climate preferences for terrain types: (temperature, moisture)
# Temperature: 0 = cold (poles), 1 = hot (equator)
# Moisture: 0 = dry, 1 = wet
TERRAIN_CLIMATE = {
    TERRAIN_ARCTIC: (0.0, 0.5),
    TERRAIN_TUNDRA: (0.2, 0.4),
    TERRAIN_DESERT: (0.7, 0.1),
    TERRAIN_PLAINS: (0.5, 0.25),
    TERRAIN_GRASSLAND: (0.5, 0.45),
    TERRAIN_FOREST: (0.5, 0.65),
    TERRAIN_SWAMP: (0.6, 0.85),
    TERRAIN_JUNGLE: (0.9, 0.9),
}

# Majority passes over the climate terrain, so it comes in patches rather than single tiles
SMOOTHING_PASSES = 2

# River moisture boost
RIVER_MOISTURE_BOOST = 0.15
RIVER_NEIGHBOR_MOISTURE_BOOST = 0.07

# River spacing: wet=5, dry=12
MIN_SPACING_WET = 5
MAX_SPACING_DRY = 12


def generate_noise(width, height, scale, rng, wrap_x=True):
    """Generate simple value noise for terrain generation."""
    noise = [[0.0] * width for _ in range(height)]

    grid_h = height // scale + 2
    grid_w = (width // scale) if wrap_x else (width // scale + 2)
    grid = [[rng.random() for _ in range(grid_w)] for _ in range(grid_h)]

    for y in range(height):
        for x in range(width):
            gx = x / scale
            gy = y / scale
            x0, y0 = int(gx), int(gy)
            x1, y1 = x0 + 1, y0 + 1
            fx, fy = gx - x0, gy - y0

            if wrap_x:
                x0 = x0 % grid_w
                x1 = x1 % grid_w

            # Smoothstep interpolation
            fx = fx * fx * (3 - 2 * fx)
            fy = fy * fy * (3 - 2 * fy)

            top = grid[y0][x0] * (1 - fx) + grid[y0][x1] * fx
            bottom = grid[y1][x0] * (1 - fx) + grid[y1][x1] * fx
            noise[y][x] = top * (1 - fy) + bottom * fy

    return noise


def calculate_percentile(values, percentile):
    """Calculate the value at a given percentile."""
    sorted_vals = sorted(values)
    idx = int(len(sorted_vals) * percentile / 100)
    return sorted_vals[min(idx, len(sorted_vals) - 1)]


def distance_to_nearest_continent(x, y, centers, width):
    """Calculate distance to nearest continent center (wrapping horizontally)."""
    min_dist = float("inf")
    for cx, cy in centers:
        dx = abs(x - cx)
        dx = min(dx, width - dx)
        dy = y - cy
        dist = (dx * dx + dy * dy) ** 0.5
        min_dist = min(min_dist, dist)
    return min_dist


def place_continent_centers(num_continents, width, height, rng):
    """Place continent centers with good spacing."""
    centers = []
    for _ in range(num_continents):
        best_x, best_y, best_dist = 0, 0, 0
        for _ in range(50):
            x = rng.randint(0, width - 1)
            y = rng.randint(0, height - 1)

            if not centers:
                best_x, best_y = x, y
                break

            min_dist = min(
                ((min(abs(x - cx), width - abs(x - cx)) ** 2) + (y - cy) ** 2) ** 0.5
                for cx, cy in centers
            )

            if min_dist > best_dist:
                best_x, best_y, best_dist = x, y, min_dist

        centers.append((best_x, best_y))
    return centers


def pick_terrain_probabilistic(temperature, moisture, rng):
    """Pick terrain type based on climate distance with probability weighting."""
    weights = []
    terrain_types = []

    for terrain_type, (pref_temp, pref_moist) in TERRAIN_CLIMATE.items():
        temp_diff = abs(temperature - pref_temp)
        moist_diff = abs(moisture - pref_moist)
        distance = (temp_diff**2 + moist_diff**2) ** 0.5
        weight = max(0.001, (1.0 - distance) ** 4)
        weights.append(weight)
        terrain_types.append(terrain_type)

    total = sum(weights)
    probabilities = [w / total for w in weights]

    r = rng.random()
    cumulative = 0
    for terrain_type, prob in zip(terrain_types, probabilities):
        cumulative += prob
        if r <= cumulative:
            return terrain_type

    return terrain_types[-1]


def find_dateline_column(terrain):
    """Find the column with fewest land pixels - this becomes our map edge."""
    land_counts = []
    for x in range(MAP_WIDTH):
        count = sum(1 for y in range(MAP_HEIGHT) if terrain[y][x] != TERRAIN_OCEAN)
        land_counts.append(count)
    return land_counts.index(min(land_counts))


def rotate_map(grid, offset):
    """Rotate a 2D grid horizontally by offset columns."""
    return [
        [grid[y][(x + offset) % MAP_WIDTH] for x in range(MAP_WIDTH)]
        for y in range(MAP_HEIGHT)
    ]


def flood_fill_continent(terrain, start_x, start_y, remaining_land):
    """Flood fill to find all connected land pixels (no wrapping)."""
    continent = set()
    stack = [(start_x, start_y)]

    while stack:
        x, y = stack.pop()
        if (x, y) in continent or (x, y) not in remaining_land:
            continue
        continent.add((x, y))

        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < MAP_WIDTH and 0 <= ny < MAP_HEIGHT:
                if (nx, ny) in remaining_land and (nx, ny) not in continent:
                    stack.append((nx, ny))

    return continent


def get_continent_coastal(terrain, continent):
    """Find coastal ocean tiles adjacent to a specific continent."""
    coastal = set()
    for lx, ly in continent:
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = lx + dx, ly + dy
            if 0 <= nx < MAP_WIDTH and 0 <= ny < MAP_HEIGHT:
                if terrain[ny][nx] == TERRAIN_OCEAN:
                    coastal.add((nx, ny))
    return coastal


def build_coastline_graph(coastal):
    """Build adjacency graph for coastal tiles using 8-direction connectivity."""
    graph = {pos: set() for pos in coastal}
    directions = [
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (-1, 1),
        (1, -1),
        (1, 1),
    ]

    for x, y in coastal:
        for dy, dx in directions:
            neighbor = (x + dx, y + dy)
            if neighbor in coastal:
                graph[(x, y)].add(neighbor)

    return graph


def remove_nearby_coastal_bfs(coastal, graph, start_x, start_y, max_distance):
    """Remove coastal tiles within max_distance steps along the coastline."""
    to_remove = set()
    visited = {(start_x, start_y): 0}
    queue = [(start_x, start_y, 0)]

    while queue:
        x, y, dist = queue.pop(0)
        if dist < max_distance:
            to_remove.add((x, y))
            for nx, ny in graph.get((x, y), []):
                if (nx, ny) not in visited:
                    visited[(nx, ny)] = dist + 1
                    queue.append((nx, ny, dist + 1))

    return to_remove


def generate_rivers(terrain, elevation, mountain_noise, moisture, rng):
    """Generate rivers that flow from land to ocean, per continent."""
    dateline = find_dateline_column(terrain)
    terrain = rotate_map(terrain, dateline)
    elevation = rotate_map(elevation, dateline)
    mountain_noise = rotate_map(mountain_noise, dateline)
    moisture = rotate_map(moisture, dateline)

    # River grid: each cell has flags for N, S, E, W connections
    rivers = [[set() for _ in range(MAP_WIDTH)] for _ in range(MAP_HEIGHT)]

    remaining_land = set()
    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            if terrain[y][x] != TERRAIN_OCEAN:
                remaining_land.add((x, y))

    while remaining_land:
        start = rng.choice(list(remaining_land))
        continent = flood_fill_continent(terrain, start[0], start[1], remaining_land)
        remaining_land -= continent

        coastal = get_continent_coastal(terrain, continent)
        if not coastal:
            continue

        coastline_graph = build_coastline_graph(coastal)

        while coastal:
            mouth_x, mouth_y = rng.choice(list(coastal))
            coastal.discard((mouth_x, mouth_y))

            start = None
            for dy, dx, from_dir in [
                (-1, 0, "S"),
                (1, 0, "N"),
                (0, -1, "E"),
                (0, 1, "W"),
            ]:
                ny, nx = mouth_y + dy, mouth_x + dx
                if (
                    0 <= nx < MAP_WIDTH
                    and 0 <= ny < MAP_HEIGHT
                    and terrain[ny][nx] != TERRAIN_OCEAN
                ):
                    start = (nx, ny, from_dir)
                    break

            if not start:
                continue

            def combined_elev(px, py):
                return elevation[py][px] + mountain_noise[py][px] * 0.5

            def find_neighbors(x, y, visited):
                neighbors = []
                for dy, dx, to_dir, from_dir in [
                    (-1, 0, "N", "S"),
                    (1, 0, "S", "N"),
                    (0, -1, "W", "E"),
                    (0, 1, "E", "W"),
                ]:
                    ny, nx = y + dy, x + dx
                    if (
                        0 <= nx < MAP_WIDTH
                        and 0 <= ny < MAP_HEIGHT
                        and (nx, ny) not in visited
                    ):
                        if terrain[ny][nx] != TERRAIN_OCEAN and not rivers[ny][nx]:
                            neighbors.append(
                                (combined_elev(nx, ny), nx, ny, to_dir, from_dir)
                            )
                return sorted(neighbors, reverse=True)

            x, y, came_from = start
            visited = {(x, y)}
            river_path = [(x, y, came_from)]

            for _ in range(100):
                current_elev = combined_elev(x, y)
                neighbors = find_neighbors(x, y, visited)

                if not neighbors:
                    break

                higher = [
                    (e, nx, ny, to_d, from_d)
                    for e, nx, ny, to_d, from_d in neighbors
                    if e >= current_elev
                ]

                if higher:
                    if len(higher) >= 2 and higher[0][0] - higher[1][0] < 0.03:
                        _, nx2, ny2, to_dir2, from_dir2 = higher[1]
                        rivers[y][x].add(to_dir2)
                        rivers[ny2][nx2].add(from_dir2)
                        visited.add((nx2, ny2))

                    best_elev, nx, ny, to_dir, from_dir = higher[0]
                elif len(river_path) < 3:
                    best_elev, nx, ny, to_dir, from_dir = neighbors[0]
                else:
                    break

                rivers[y][x].add(to_dir)

                next_neighbors = find_neighbors(nx, ny, visited | {(nx, ny)})
                has_higher = any(e > best_elev for e, *_ in next_neighbors)

                if has_higher or len(river_path) < 3:
                    rivers[ny][nx].add(from_dir)
                    visited.add((nx, ny))
                    river_path.append((nx, ny, from_dir))
                    x, y = nx, ny
                else:
                    break

            if len(river_path) >= 2:
                sx, sy, from_dir = river_path[0]
                rivers[sy][sx].add(from_dir)

                local_moisture = moisture[sy][sx]
                river_spacing = int(
                    MAX_SPACING_DRY
                    - (MAX_SPACING_DRY - MIN_SPACING_WET) * local_moisture
                )

                to_remove = remove_nearby_coastal_bfs(
                    coastal, coastline_graph, mouth_x, mouth_y, river_spacing
                )
                coastal -= to_remove

    rivers = rotate_map(rivers, MAP_WIDTH - dateline)
    return rivers


def boost_moisture_near_rivers(moisture, rivers):
    """Increase moisture for river tiles and their neighbors."""
    boosted = [[moisture[y][x] for x in range(MAP_WIDTH)] for y in range(MAP_HEIGHT)]

    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            if rivers[y][x]:
                boosted[y][x] = min(1.0, boosted[y][x] + RIVER_MOISTURE_BOOST)
                for dy, dx in [
                    (-1, 0),
                    (1, 0),
                    (0, -1),
                    (0, 1),
                    (-1, -1),
                    (-1, 1),
                    (1, -1),
                    (1, 1),
                ]:
                    ny, nx = y + dy, (x + dx) % MAP_WIDTH
                    if 0 <= ny < MAP_HEIGHT:
                        boosted[ny][nx] = min(
                            1.0, boosted[ny][nx] + RIVER_NEIGHBOR_MOISTURE_BOOST
                        )

    return boosted


def assign_terrain_climate(terrain, moisture, rng):
    """Assign terrain types based on climate (temperature from latitude, moisture)."""
    for y in range(MAP_HEIGHT):
        temperature = 1.0 - abs(y - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2)

        for x in range(MAP_WIDTH):
            if terrain[y][x] not in (TERRAIN_OCEAN, TERRAIN_MOUNTAINS, TERRAIN_HILLS):
                moist = moisture[y][x]
                terrain[y][x] = pick_terrain_probabilistic(temperature, moist, rng)

    return smooth_terrain(terrain)


def smooth_terrain(terrain):
    """Let each tile take the most common climate terrain around it; on a tie it keeps its own."""
    for _ in range(SMOOTHING_PASSES):
        smoothed = [row[:] for row in terrain]
        for y in range(MAP_HEIGHT):
            for x in range(MAP_WIDTH):
                if terrain[y][x] not in TERRAIN_CLIMATE:
                    continue
                votes = Counter([terrain[y][x]])
                votes.update(
                    terrain[y + dy][(x + dx) % MAP_WIDTH]
                    for dy in (-1, 0, 1)
                    for dx in (-1, 0, 1)
                    if (dx or dy) and 0 <= y + dy < MAP_HEIGHT and terrain[y + dy][(x + dx) % MAP_WIDTH] in TERRAIN_CLIMATE
                )
                smoothed[y][x] = votes.most_common(1)[0][0]
        terrain = smoothed
    return terrain


def generate_map(seed: int) -> tuple:
    """Generate a terrain map with coherent landmasses and rivers."""
    rng = random.Random(seed)

    terrain = [[TERRAIN_OCEAN] * MAP_WIDTH for _ in range(MAP_HEIGHT)]

    # Place continent centers
    centers = place_continent_centers(NUM_CONTINENTS, MAP_WIDTH, MAP_HEIGHT, rng)

    max_dist = ((MAP_WIDTH / 2) ** 2 + (MAP_HEIGHT / 2) ** 2) ** 0.5

    noise = generate_noise(MAP_WIDTH, MAP_HEIGHT, scale=6, rng=rng)
    detail = generate_noise(MAP_WIDTH, MAP_HEIGHT, scale=3, rng=rng)

    elevation = [[0.0] * MAP_WIDTH for _ in range(MAP_HEIGHT)]
    for y in range(MAP_HEIGHT):
        lat = 1.0 - abs(y - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2)
        polar_factor = 0.92 + 0.08 * lat

        for x in range(MAP_WIDTH):
            dist = distance_to_nearest_continent(x, y, centers, MAP_WIDTH)
            continent_elev = 1.0 - (dist / max_dist)
            continent_elev = continent_elev**0.5

            noise_val = noise[y][x] * 0.5 + detail[y][x] * 0.5
            elevation[y][x] = (continent_elev * 0.7 + noise_val * 0.3) * polar_factor

    all_elevations = [
        elevation[y][x] for y in range(MAP_HEIGHT) for x in range(MAP_WIDTH)
    ]
    ocean_cutoff = calculate_percentile(all_elevations, OCEAN_PERCENT)

    mountain_noise = generate_noise(MAP_WIDTH, MAP_HEIGHT, scale=3, rng=rng)
    mountain_detail = generate_noise(MAP_WIDTH, MAP_HEIGHT, scale=2, rng=rng)
    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            mountain_noise[y][x] = (
                mountain_noise[y][x] * 0.6 + mountain_detail[y][x] * 0.4
            )

    land_mountain_vals = [
        mountain_noise[y][x]
        for y in range(MAP_HEIGHT)
        for x in range(MAP_WIDTH)
        if elevation[y][x] >= ocean_cutoff
    ]
    land_percent = 100 - OCEAN_PERCENT
    hills_cutoff = calculate_percentile(
        land_mountain_vals,
        100 - (MOUNTAIN_PERCENT + HILLS_PERCENT) * 100 / land_percent,
    )
    mountain_cutoff = calculate_percentile(
        land_mountain_vals, 100 - MOUNTAIN_PERCENT * 100 / land_percent
    )

    moisture = [[0.0] * MAP_WIDTH for _ in range(MAP_HEIGHT)]
    moisture_noise = generate_noise(MAP_WIDTH, MAP_HEIGHT, scale=3, rng=rng)
    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            moisture[y][x] = moisture_noise[y][x]

    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            elev = elevation[y][x]
            mtn = mountain_noise[y][x]

            if elev < ocean_cutoff:
                terrain[y][x] = TERRAIN_OCEAN
            elif mtn >= mountain_cutoff:
                terrain[y][x] = TERRAIN_MOUNTAINS
            elif mtn >= hills_cutoff:
                terrain[y][x] = TERRAIN_HILLS
            else:
                terrain[y][x] = TERRAIN_GRASSLAND  # Placeholder

    # Generate rivers
    rivers = generate_rivers(terrain, elevation, mountain_noise, moisture, rng)

    # Boost moisture near rivers
    moisture = boost_moisture_near_rivers(moisture, rivers)

    # Assign climate-based terrain
    terrain = assign_terrain_climate(terrain, moisture, rng)

    return terrain, rivers


def find_starting_positions(terrain: list, num_players: int, seed: int) -> list:
    """Find good starting positions for players on land tiles."""
    rng = random.Random(seed + 1000)

    def land_around(x, y):
        return sum(
            1
            for dy in range(-2, 3)
            for dx in range(-2, 3)
            if 0 <= y + dy < MAP_HEIGHT and terrain[y + dy][(x + dx) % MAP_WIDTH] != TERRAIN_OCEAN
        )

    land_tiles = [
        (x, y)
        for y in range(MAP_HEIGHT)
        for x in range(MAP_WIDTH)
        if terrain[y][x] in (TERRAIN_GRASSLAND, TERRAIN_PLAINS) and land_around(x, y) >= 15
    ]

    if not land_tiles:
        return [(MAP_WIDTH // 2, MAP_HEIGHT // 2)] * num_players

    positions = []

    for _ in range(num_players):
        best_pos = None
        best_min_dist = -1

        for _ in range(100):
            pos = rng.choice(land_tiles)

            if positions:
                min_d = min(
                    math.sqrt((pos[0] - p[0]) ** 2 + (pos[1] - p[1]) ** 2)
                    for p in positions
                )
            else:
                min_d = float("inf")

            if min_d > best_min_dist:
                best_min_dist = min_d
                best_pos = pos

        positions.append(best_pos if best_pos else rng.choice(land_tiles))

    return positions


def pack_map(terrain: list) -> str:
    """Pack terrain map to single-char-per-tile string."""
    chars = "oGPDFHMTASJ"  # Maps to terrain types 0-10
    return "".join(chars[t] if t < len(chars) else "o" for row in terrain for t in row)


def pack_rivers(rivers: list) -> str:
    """Pack rivers to single-char-per-tile string using 4-bit encoding.

    Matches SP257.png river sprite row layout:
    Bit 0 = N, Bit 1 = E, Bit 2 = S, Bit 3 = W
    Encoded as hex digit (0-9, a-f)
    """
    result = []
    for row in rivers:
        for cell in row:
            val = 0
            if "N" in cell:
                val |= 1
            if "E" in cell:
                val |= 2
            if "S" in cell:
                val |= 4
            if "W" in cell:
                val |= 8
            result.append(format(val, "x"))
    return "".join(result)


NUM_PLAYERS = 4


class Civ(Project):
    def fill_dict(self, request, d):
        seed = random.randint(0, 2**31)
        terrain, rivers = generate_map(seed)
        d["map_packed"] = pack_map(terrain)
        d["rivers_packed"] = pack_rivers(rivers)
        d["starts_json"] = json.dumps(find_starting_positions(terrain, NUM_PLAYERS, seed))
