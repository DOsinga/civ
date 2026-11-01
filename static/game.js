// Civilization Game Engine
// Main game logic, input handling, UI

import { TERRAIN, IMPROVEMENT, getTerrainName, canIrrigate, canMine, getImprovementTurns, getIrrigationTransform, getMineTransform } from './terrain.js';
import { world, MAP_WIDTH, MAP_HEIGHT } from './world.js';
import {
    TILE_SIZE, VIEW_TILES_X, VIEW_TILES_Y,
    viewX, viewY, setView, centerViewOn, scrollView,
    loadSprites, initCanvas, toPanelUnits, VIEW_WIDTH,
    render, screenToMap, minimapToMap,
    getMainCanvas, setOnImagesLoaded,
    startBlinking, stopBlinking,
    setUnitAnimation, clearUnitAnimation,
    isTechDiscoveryOpen,
    isResearchScreenOpen, handleResearchScreenClick, handleResearchScreenKey,
    isChangeProductionScreenOpen, handleChangeProductionClick, handleChangeProductionKey,
    isBuyConfirmScreenOpen, handleBuyConfirmClick, handleBuyConfirmKey,
    choiceDialogOptionAt
} from './view.js';
import { handleCityScreenClick } from './city_view.js';
import {
    isCityScreenOpen, getCurrentCity, updateCityScreen,
    openCityScreen,
    getProductionOptions, getProductionData, changeProduction, getBuyCost, buyProduction,
    helpBuildWonder, renameCity, toggleCityTileWorker
} from './citymanagement.js';
import { getAvailableGovernments } from './government.js';
import { TECHNOLOGIES } from './tech.js';
import { uiState, UIStateType } from './uistate.js';

// Game state
let selectedUnit = null;
let unitActivatedFromGarrison = false;  // True if unit was explicitly selected from city garrison

// Helper to render with current UI state
function renderWithState() {
    render(selectedUnit, uiState.getState());
}

// Setup UI state machine callbacks
function setupUIState() {
    // Wire up view callbacks - only rendering/visual functions
    uiState.setViewCallbacks({
        render: (unit) => render(unit, uiState.getState()),
        startBlinking: (cb) => startBlinking(cb),
        stopBlinking: () => stopBlinking(),
        centerViewOn: (x, y) => centerViewOn(x, y),
    });

    // Handle state changes for keeping game.js state in sync
    uiState.onStateChange = (state) => {
        switch (state.type) {
            case UIStateType.TURN_ENDED:
                selectedUnit = null;
                renderWithState();
                break;

            case UIStateType.UNIT_ACTIVE:
                selectedUnit = state.data?.unit;
                renderWithState();
                break;

            case UIStateType.CITY_SCREEN:
                // Open city screen with the city from state data
                if (state.data?.city) {
                    openCityScreen(state.data.city);
                }
                renderWithState();
                break;

            case UIStateType.TECH_DISCOVERY:
            case UIStateType.RESEARCH_SELECTION:
            case UIStateType.CHANGE_PRODUCTION:
            case UIStateType.BUY_CONFIRM:
                // These screens render themselves from uiState data
                renderWithState();
                break;

            default:
                renderWithState();
                break;
        }
    };
}

// Drag state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartViewX = 0;
let dragStartViewY = 0;

// Key state for diagonal movement
const keysPressed = new Set();
let moveTimeout = null;
const MOVE_DELAY = 50;  // ms to wait for second key press

// Animation state
let animatingUnit = null;
let animStartX = 0;
let animStartY = 0;
let animEndX = 0;
let animEndY = 0;
let animStartTime = 0;
const ANIM_DURATION = 150; // ms for smooth movement

// ============================================
// INPUT HANDLING
// ============================================

function handleMapMouseMove(e) {
    // Mouse move updates happen in render() now
}

function handleMapMouseDown(e) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartViewX = viewX;
    dragStartViewY = viewY;
}

function handleMapMouseUp(e) {
    isDragging = false;
}

function handleMapDrag(e) {
    if (!isDragging) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    const screenTileSize = TILE_SIZE * getMainCanvas().getBoundingClientRect().width / VIEW_WIDTH;
    const tileDx = Math.round(-dx / screenTileSize);
    const tileDy = Math.round(-dy / screenTileSize);

    const newViewX = Math.max(0, Math.min(MAP_WIDTH - VIEW_TILES_X, dragStartViewX + tileDx));
    const newViewY = Math.max(0, Math.min(MAP_HEIGHT - VIEW_TILES_Y, dragStartViewY + tileDy));

    if (newViewX !== viewX || newViewY !== viewY) {
        setView(newViewX, newViewY);
        renderWithState();
    }
}

function handleMapClick(e) {
    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);
    if (dx > 10 || dy > 10) return; // Was a drag (slightly higher threshold for CSS scaling)

    if (uiState.getState().type === UIStateType.INFO_DIALOG) {
        uiState.dismissInfo();
        return;
    }

    if (uiState.getState().type === UIStateType.CHOICE_DIALOG) {
        const index = choiceDialogOptionAt(e.clientX, e.clientY);
        if (index >= 0) {
            uiState.chooseOption(index);
        } else {
            uiState.cancelChoice();
        }
        return;
    }

    // Handle tech discovery screen clicks
    if (isTechDiscoveryOpen()) {
        uiState.closeTechDiscovery();
        return;
    }

    // Handle research selection screen clicks
    if (isResearchScreenOpen()) {
        handleResearchScreenClick(e.clientX, e.clientY);
        return;
    }

    // Handle change production screen clicks
    if (isChangeProductionScreenOpen()) {
        handleChangeProductionClick(e.clientX, e.clientY);
        return;
    }

    // Handle buy confirmation screen clicks
    if (isBuyConfirmScreenOpen()) {
        handleBuyConfirmClick(e.clientX, e.clientY);
        return;
    }

    // Handle city screen clicks
    if (isCityScreenOpen()) {
        const { x, y } = toPanelUnits(e.clientX, e.clientY);
        const action = handleCityScreenClick(x, y);
        if (action === 'exit') {
            uiState.closeCity();
        } else if (action === 'change') {
            showChangeProductionDialog();
        } else if (action === 'buy') {
            showBuyProductionDialog();
        } else if (action === 'rename') {
            renameCity();
        } else if (action === 'buildings') {
            updateCityScreen();
        } else if (action && action.type === 'tile') {
            // Handle tile click in city map - toggle worker
            handleCityTileClick(action.dx, action.dy);
        } else if (action && action.type === 'garrison') {
            // Clicked a garrisoned unit - activate it and mark as activated from garrison
            unitActivatedFromGarrison = true;
            selectUnit(action.unit);
        }
        return;
    }

    const result = screenToMap(e.clientX, e.clientY);

    if (result.inMenu) {
        showGameMenu();
        return;
    }

    // Handle minimap clicks
    if (result.inMinimap) {
        const { mapX, mapY } = minimapToMap(e.clientX, e.clientY);
        centerViewOn(mapX, mapY);
        renderWithState();
        return;
    }

    // Ignore clicks outside map area
    if (!result.inMap) return;

    const { mapX, mapY } = result;

    // Check if clicked on a city
    const clickedCity = world.getCityAt(mapX, mapY);
    if (clickedCity && clickedCity.player === world.humanPlayer.id) {
        uiState.openCity(clickedCity);
        return;
    }

    // If we have a selected unit, try to move
    if (selectedUnit && selectedUnit.canMove()) {
        const unitDx = mapX - selectedUnit.x;
        const unitDy = mapY - selectedUnit.y;

        if (Math.abs(unitDx) <= 1 && Math.abs(unitDy) <= 1 && (unitDx !== 0 || unitDy !== 0)) {
            if (moveUnit(selectedUnit, unitDx, unitDy)) return;
        }
    }

    // Try to select a unit
    selectUnitAt(mapX, mapY);
}

function handleCityTileClick(dx, dy) {
    toggleCityTileWorker(getCurrentCity(), dx, dy);
    updateCityScreen();
}

function showChangeProductionDialog() {
    const city = getCurrentCity();
    uiState.showChangeProduction(city, getProductionOptions(city, world.humanPlayer), (productionId) => {
        changeProduction(city, productionId);
        updateCityScreen();
    });
}

function showBuyProductionDialog() {
    const city = getCurrentCity();
    const cost = getBuyCost(city);
    if (cost === 0) return;
    uiState.showBuyConfirm(city, getProductionData(city.production.type).name, cost, () => {
        buyProduction(city, world.humanPlayer);
        updateCityScreen();
    });
}

// ============================================
// GAME MENU
// ============================================

function showGameMenu() {
    const player = world.humanPlayer;
    const options = [{ label: 'Tax Rate', value: 'tax' }, { label: 'Luxury Rate', value: 'lux' }];
    if (player.government !== 'anarchy') {
        options.push({ label: 'REVOLUTION!', value: 'revolution' });
    }
    uiState.showChoice('Game', options, (choice) => {
        if (choice === 'revolution') {
            showRevolutionDialog();
        } else {
            showRateDialog(choice);
        }
    });
}

function showRateDialog(which) {
    const player = world.humanPlayer;
    if (player.government === 'anarchy') {
        uiState.showInfo('No taxes or science under Anarchy.');
        return;
    }
    const options = [];
    for (let value = 0; value <= 10; value++) {
        const tax = which === 'tax' ? value : player.rates.tax;
        const lux = which === 'lux' ? value : player.rates.lux;
        if (player.canSetRates(tax, lux)) {
            options.push({ label: `Tax ${tax * 10}% Lux ${lux * 10}% Sci ${(10 - tax - lux) * 10}%`, value: [tax, lux] });
        }
    }
    uiState.showChoice(`${which === 'tax' ? 'Tax' : 'Luxury'} rate (max ${player.gov.maxRate}%)`, options, ([tax, lux]) => {
        player.setRates(tax, lux);
        renderWithState();
    });
}

function showRevolutionDialog() {
    const player = world.humanPlayer;
    const options = getAvailableGovernments(player)
        .filter(g => g.id !== player.government)
        .map(g => ({ label: g.name, value: g.id }));
    if (options.length === 0) {
        uiState.showInfo('There is no other form of government we know of.');
        return;
    }
    uiState.showChoice('Revolution! Which government?', options, (governmentId) => {
        world.startRevolution(player, governmentId);
        if (player.government === 'anarchy') {
            uiState.showInfo('Revolution! The government falls into Anarchy.');
        } else {
            uiState.showInfo(`The new government is ${player.gov.name}.`);
        }
    });
}

// Minimap clicks are now handled in handleMapClick via screenToMap.inMinimap

function handleKeyDown(e) {
    // Handle tech discovery screen - any key closes it
    if (isTechDiscoveryOpen()) {
        e.preventDefault();
        uiState.closeTechDiscovery();
        return;
    }

    // Handle research selection screen
    if (isResearchScreenOpen()) {
        e.preventDefault();
        handleResearchScreenKey(e.key);
        return;
    }

    // Handle change production screen
    if (isChangeProductionScreenOpen()) {
        e.preventDefault();
        handleChangeProductionKey(e.key);
        return;
    }

    // Handle buy confirmation screen
    if (isBuyConfirmScreenOpen()) {
        e.preventDefault();
        handleBuyConfirmKey(e.key);
        return;
    }

    // Let UI state machine handle keys first
    if (uiState.handleKey(e.key)) {
        e.preventDefault();
        return;
    }

    // Always prevent arrow keys from scrolling the page
    if (e.key.startsWith('Arrow')) {
        e.preventDefault();
    }

    // Track arrow key state for diagonal movement
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!keysPressed.has(e.key)) {
            keysPressed.add(e.key);
            // Delay movement slightly to allow for diagonal key combos
            if (moveTimeout) clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                moveTimeout = null;
                tryMoveUnit();
            }, MOVE_DELAY);
        }
        return;
    }

    // B to found city
    if (e.key === 'b' || e.key === 'B') { foundCity(); }

    // Settler improvement commands
    if (e.key === 'i' || e.key === 'I') { buildImprovement(IMPROVEMENT.IRRIGATION); }
    if (e.key === 'r' || e.key === 'R') { buildImprovement(IMPROVEMENT.ROAD); }
    if (e.key === 'm' || e.key === 'M') { buildImprovement(IMPROVEMENT.MINE); }
}

function handleKeyUp(e) {
    keysPressed.delete(e.key);
}

function tryMoveUnit() {
    // Don't start new movement if already animating
    if (animatingUnit) return;

    if (!selectedUnit || !selectedUnit.canMove()) return;

    // Calculate direction from pressed keys
    let dx = 0;
    let dy = 0;
    if (keysPressed.has('ArrowLeft')) dx -= 1;
    if (keysPressed.has('ArrowRight')) dx += 1;
    if (keysPressed.has('ArrowUp')) dy -= 1;
    if (keysPressed.has('ArrowDown')) dy += 1;

    if (dx === 0 && dy === 0) return;

    // Clear garrison activation flag when unit moves
    unitActivatedFromGarrison = false;

    // Use moveUnit which handles combat
    moveUnit(selectedUnit, dx, dy);
}

function animateMovement(timestamp) {
    if (!animatingUnit) return;

    const elapsed = timestamp - animStartTime;
    const progress = Math.min(1, elapsed / ANIM_DURATION);

    // Use easeOut for smoother feel
    const eased = 1 - Math.pow(1 - progress, 2);

    // Set animation position and render
    const visualX = animStartX + (animEndX - animStartX) * eased;
    const visualY = animStartY + (animEndY - animStartY) * eased;
    setUnitAnimation(animatingUnit.id, visualX, visualY);
    renderWithState();

    if (progress < 1) {
        requestAnimationFrame(animateMovement);
    } else {
        // Animation complete
        clearUnitAnimation();
        const movedUnit = animatingUnit;
        animatingUnit = null;

        // Notify UI state machine about the move
        uiState.unitMoved(movedUnit);

        // Check if keys are still pressed for continuous movement
        if (movedUnit.canMove() && keysPressed.size > 0 && movedUnit === selectedUnit) {
            // Continue moving if keys still held (keyboard movement)
            tryMoveUnit();
        }
    }
}

// ============================================
// GAME LOGIC
// ============================================

function getTileInfo(mapX, mapY) {
    if (mapX < 0 || mapX >= MAP_WIDTH || mapY < 0 || mapY >= MAP_HEIGHT) {
        return null;
    }

    const terrainType = world.getTerrainAt(mapX, mapY);
    let info = `${getTerrainName(terrainType)} (${mapX}, ${mapY})`;

    // Add resource info if present
    const resourceName = world.getResourceNameAt(mapX, mapY);
    if (resourceName) {
        info = `${resourceName} - ${info}`;
    }

    const city = world.getCityAt(mapX, mapY);
    if (city) {
        const player = world.getPlayer(city.player);
        info = `${city.name} (${player?.adjective || 'Unknown'}) - ${info}`;
    }

    const units = world.getUnitsAt(mapX, mapY);
    if (units.length > 0) {
        const unit = units[0];
        const player = world.getPlayer(unit.player);
        info = city ? `${info} [${unit.name}]` : `${unit.name} (${player?.adjective || 'Unknown'}) - ${info}`;
    }

    return info;
}

function selectUnit(unit) {
    if (unit && unit.player === world.humanPlayer.id) {
        // Delegate to UI state machine
        uiState.activateUnit(unit);
        return true;
    }
    return false;
}

function selectUnitAt(mapX, mapY) {
    const units = world.getUnitsAt(mapX, mapY);
    // Only select human player's units
    const humanUnit = units.find(u => u.player === world.humanPlayer.id);
    if (humanUnit) {
        // Wake up fortified units when clicked
        humanUnit.wake();
    }
    return selectUnit(humanUnit);
}

function selectNextUnit() {
    // Delegate to UI state machine
    unitActivatedFromGarrison = false;
    uiState.selectNextUnit();
}

function moveUnit(unit, dx, dy) {
    if (animatingUnit) return false;
    if (!unit.canMove()) return false;

    const newX = unit.x + dx;
    const newY = unit.y + dy;

    if (world.hasEnemyAt(unit, newX, newY)) {
        if (world.canAttack(unit, newX, newY)) {
            attackTile(unit, newX, newY);
            return true;
        }
        if (!world.canCaptureCity(unit, newX, newY)) return false;
    } else if (!world.canEnter(unit, newX, newY)) {
        return false;
    }

    stopBlinking();
    animatingUnit = unit;
    animStartX = unit.x;
    animStartY = unit.y;
    animEndX = newX;
    animEndY = newY;
    animStartTime = performance.now();

    const capture = world.moveUnit(unit, newX, newY);
    if (capture) {
        animatingUnit = null;
        showCaptureMessage(capture);
        return true;
    }

    const city = world.getCityAt(newX, newY);
    if (unit.hasAbility('help_wonder') && city && getProductionData(city.production.type).isWonder) {
        animatingUnit = null;
        uiState.showChoice(`Caravan arrives in ${city.name}`, [
            { label: 'Help build Wonder', value: true },
            { label: 'Keep moving', value: false },
        ], (help) => {
            if (help) helpBuildWonder(city, unit, world.humanPlayer);
        });
        return true;
    }

    requestAnimationFrame(animateMovement);
    return true;
}

function showCaptureMessage({ city, loser, plunder, stolen, destroyed }) {
    let message = destroyed
        ? `${world.humanPlayer.adjective} forces destroy ${city.name}! ${plunder} gold plundered.`
        : `${world.humanPlayer.adjective} forces capture ${city.name}! ${plunder} gold plundered.`;
    if (stolen) message += ` We learn ${TECHNOLOGIES[stolen].name}.`;
    if (!loser.alive) message += ` The ${loser.name} are destroyed!`;
    uiState.showInfo(message, () => uiState.selectNextUnit());
}

function attackTile(attacker, x, y) {
    const result = world.attack(attacker, x, y);
    const adjective = (u) => world.getPlayer(u.player).adjective;
    let message;
    if (result.nuclear) {
        message = `Nuclear detonation! ${result.killed.length - 1} units destroyed.`;
    } else if (result.attackerWins) {
        message = `${adjective(attacker)} ${attacker.name} defeated ${adjective(result.defender)} ${result.defender.name}!`;
        if (result.killed.length > 1) message += ` ${result.killed.length - 1} more units lost with it.`;
    } else {
        message = `${adjective(attacker)} ${attacker.name} was destroyed by ${adjective(result.defender)} ${result.defender.name}!`;
    }
    uiState.showInfo(message, () => {
        if (attacker.movesLeft > 0 && world.humanPlayer.units.includes(attacker)) {
            uiState.activateUnit(attacker);
        } else {
            uiState.selectNextUnit();
        }
    });
}

function foundCity() {
    if (!selectedUnit || !selectedUnit.canFoundCity()) return;
    if (selectedUnit.player !== world.humanPlayer.id) return;

    if (!world.canFoundCityAt(selectedUnit.x, selectedUnit.y)) {
        uiState.showInfo("Can't build a city here!", () => uiState.activateUnit(selectedUnit));
        return;
    }

    const name = prompt('Name your city:', world.humanPlayer.getNextCityName());
    if (!name) return;

    world.foundCity(selectedUnit, name);

    if (world.humanPlayer.currentResearch) {
        uiState.selectNextUnit();
    } else {
        uiState.showResearchChoice();
    }
}

function buildImprovement(improvementType) {
    if (!selectedUnit) return;
    if (selectedUnit.player !== world.humanPlayer.id) return;

    const terrainType = world.getTerrainAt(selectedUnit.x, selectedUnit.y);

    // Check if settler can build this improvement
    if (improvementType === IMPROVEMENT.IRRIGATION) {
        if (!selectedUnit.canIrrigate()) {
            refuse("This unit cannot irrigate!");
            return;
        }
        if (!canIrrigate(terrainType)) {
            refuse("Cannot irrigate this terrain type!");
            return;
        }
        // Clearing forest, jungle or swamp doesn't need water
        if (getIrrigationTransform(terrainType) === null) {
            if (world.hasImprovement(selectedUnit.x, selectedUnit.y, IMPROVEMENT.IRRIGATION)) {
                refuse("This tile is already irrigated!");
                return;
            }
            if (!world.hasWaterAccess(selectedUnit.x, selectedUnit.y)) {
                refuse("Irrigation requires adjacent water or irrigation!");
                return;
            }
        }
    } else if (improvementType === IMPROVEMENT.MINE) {
        if (!selectedUnit.canMine()) {
            refuse("This unit cannot build mines!");
            return;
        }
        if (!canMine(terrainType)) {
            refuse("Cannot mine this terrain type!");
            return;
        }
        if (getMineTransform(terrainType) === null &&
            world.hasImprovement(selectedUnit.x, selectedUnit.y, IMPROVEMENT.MINE)) {
            refuse("This tile already has a mine!");
            return;
        }
    } else if (improvementType === IMPROVEMENT.ROAD) {
        if (!selectedUnit.canBuildRoad()) {
            refuse("This unit cannot build roads!");
            return;
        }
        if (terrainType === TERRAIN.OCEAN) {
            refuse("Cannot build roads on ocean!");
            return;
        }
        // With the Railroad advance, R on a road upgrades it to a railroad
        if (world.hasImprovement(selectedUnit.x, selectedUnit.y, IMPROVEMENT.ROAD)) {
            if (!world.humanPlayer.hasTech('railroad')) {
                refuse("This tile already has a road!");
                return;
            }
            if (world.hasImprovement(selectedUnit.x, selectedUnit.y, IMPROVEMENT.RAILROAD)) {
                refuse("This tile already has a railroad!");
                return;
            }
            improvementType = IMPROVEMENT.RAILROAD;
        }
    }

    // Get turns required
    const turns = getImprovementTurns(terrainType, improvementType);
    if (turns <= 0) {
        refuse("Cannot build that improvement here!");
        return;
    }

    // Start building
    selectedUnit.startBuilding(improvementType, turns);

    // Select next unit
    uiState.selectNextUnit();
}

function refuse(message) {
    const unit = selectedUnit;
    uiState.showInfo(message, () => uiState.activateUnit(unit));
}

// ============================================
// TURN PROCESSING
// ============================================

function endTurn() {
    // Use the UI state machine to handle turn processing
    // This calls world.step() and processes events (tech, production, etc.)
    uiState.endTurn();
}

// Legacy function - now handled by uiState.showResearchChoice()
function showChooseResearchDialog(player) {
    uiState.showResearchChoice();
}

// ============================================
// UI
// ============================================

function updateUI() {
    // Sidebar is now rendered directly on canvas in view.js
    // Just trigger a re-render
    renderWithState();
}

function updateTurnDisplay() {
    // Turn/gold display is now rendered on canvas in view.js sidebar
    renderWithState();
}

// ============================================
// INITIALIZATION
// ============================================

function initGame(gameData) {
    // Setup canvas
    const { mainCanvas, minimapCanvas } = initCanvas();

    // Setup UI state machine
    setupUIState();

    // Setup event handlers (single canvas handles both map and minimap)
    mainCanvas.addEventListener('click', handleMapClick);
    mainCanvas.addEventListener('mousedown', handleMapMouseDown);
    mainCanvas.addEventListener('mousemove', handleMapMouseMove);
    mainCanvas.addEventListener('mousemove', handleMapDrag);
    mainCanvas.addEventListener('mouseup', handleMapMouseUp);
    mainCanvas.addEventListener('mouseleave', handleMapMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    setOnImagesLoaded(() => {
        if (selectedUnit && selectedUnit.canMove()) {
            startBlinking(() => renderWithState());
        }
        renderWithState();
    });

    // Load map
    world.unpackMap(gameData.mapPacked);

    // Load rivers (if present)
    if (gameData.riversPacked) {
        world.unpackRivers(gameData.riversPacked);
    }

    // Distribute bonus resources across the map (~1/16 chance per tile)
    world.distributeResources();

    // Every civilization starts with a settler and a militia, the human player first
    world.setupGame('egyptians', gameData.starts.length - 1);
    world.players.forEach((player, i) => {
        const [x, y] = gameData.starts[i];
        player.createUnit('settler', x, y);
        player.createUnit('militia', x, y);
    });

    const [startX, startY] = gameData.starts[0];
    centerViewOn(startX, startY);

    // Select first unit and start blinking
    if (world.humanPlayer.units.length > 0) {
        selectUnit(world.humanPlayer.units[0]);
    }

    // Initial render
    renderWithState();
}

// ============================================
// EXPORTS
// ============================================

window.initGame = initGame;
window.isUnitActivatedFromGarrison = () => unitActivatedFromGarrison;
window.loadSprites = loadSprites;
