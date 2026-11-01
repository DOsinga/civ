// UI State Machine - manages what the user is currently doing/seeing

import { world } from './world.js';
import { getAvailableResearch } from './tech.js';
import { UnitStatus, GameEventType } from './units.js';
import { IMPROVEMENT } from './terrain.js';

// Re-export UnitStatus and GameEventType for convenience
export { UnitStatus, GameEventType };

// UI states
export const UIStateType = {
    TURN_ENDED: 'turn_ended',               // Shows "Press Enter", waits for input
    UNIT_ACTIVE: 'unit_active',             // Unit selected, awaiting orders
    CITY_SCREEN: 'city_screen',             // City management screen open
    TECH_DISCOVERY: 'tech_discovery',       // Tech discovered popup
    RESEARCH_SELECTION: 'research_selection', // Choose next research
    CHANGE_PRODUCTION: 'change_production', // Change city production dialog
    BUY_CONFIRM: 'buy_confirm',             // Confirm purchase dialog
    INFO_DIALOG: 'info_dialog',             // Dismissable notification
    CHOICE_DIALOG: 'choice_dialog',         // User must make a choice
    MENU: 'menu',                           // A menu from the menu bar is open
    REPORT: 'report',                       // Full-screen advisor, world or Civilopedia report
};

class UIStateMachine {
    constructor() {
        this.state = UIStateType.TURN_ENDED;
        this.data = null;
        this.pendingEvents = [];
        this.onStateChange = null;  // Callback for rendering
        this.lastUnit = null;       // Unit to return to after a menu or report closes

        // View integration callbacks (set by game.js) - for rendering only, not state
        this.viewCallbacks = {
            render: null,           // () => void - re-render current state
            startBlinking: null,    // (callback) => void
            stopBlinking: null,     // () => void
            centerViewOn: null,     // (x, y) => void
        };
    }

    // Set view callbacks (called during init)
    setViewCallbacks(callbacks) {
        Object.assign(this.viewCallbacks, callbacks);
    }

    // Get current state info for rendering
    getState() {
        return {
            type: this.state,
            data: this.data,
        };
    }

    // Called when user presses Enter in TURN_ENDED state
    endTurn() {
        if (this.state !== UIStateType.TURN_ENDED) return;

        // Process the turn and get events
        const events = world.step();
        this.startTurn(events);
    }

    // Called after world.step() with list of events to show
    startTurn(events) {
        this.pendingEvents = [...events];
        this.processNextEvent();
    }

    // Process queued events one by one
    processNextEvent() {
        if (this.pendingEvents.length > 0) {
            const event = this.pendingEvents.shift();
            this.handleGameEvent(event);
        } else {
            this.selectNextUnit();
        }
    }

    // Handle a game event (show notification, open dialog, etc.)
    handleGameEvent(event) {
        switch (event.type) {
            case GameEventType.TECH_DISCOVERED:
                // Show tech discovery screen, then prompt for new research
                this.showTechDiscovery(event.tech, () => {
                    this.showResearchChoice();
                });
                break;

            case GameEventType.NO_RESEARCH:
                this.showResearchChoice();
                break;

            case GameEventType.CITY_BUILT:
                // Show what was built, then open city
                this.showInfo(`${event.city.name} has built ${event.building.name}`, () => {
                    this.openCity(event.city);
                });
                break;

            case GameEventType.MESSAGE:
                this.showInfo(event.message);
                break;

            case GameEventType.GOVERNMENT_CHANGED:
                this.showInfo(`The new government is ${event.government}.`);
                break;

            case GameEventType.IMPROVEMENT_COMPLETE: {
                const names = {
                    [IMPROVEMENT.ROAD]: 'Road',
                    [IMPROVEMENT.MINE]: 'Mine',
                    [IMPROVEMENT.IRRIGATION]: 'Irrigation',
                    [IMPROVEMENT.RAILROAD]: 'Railroad',
                };
                this.showInfo(`${names[event.improvement]} completed!`, () => {
                    // Activate the unit that just finished building
                    if (event.unit && event.unit.player === world.humanPlayer.id) {
                        this.activateUnit(event.unit);
                    } else {
                        this.processNextEvent();
                    }
                });
                break;
            }

            default:
                this.processNextEvent();
                break;
        }
    }

    // Show tech discovery popup
    showTechDiscovery(tech, onClose) {
        this.state = UIStateType.TECH_DISCOVERY;
        this.data = { tech, onClose };
        this.notify();
    }

    // Dismiss tech discovery popup
    closeTechDiscovery() {
        if (this.state !== UIStateType.TECH_DISCOVERY) return;
        const onClose = this.data?.onClose;
        this.data = null;
        if (onClose) {
            onClose();
        } else {
            this.processNextEvent();
        }
    }

    // Show research selection dialog
    showResearchChoice() {
        const available = getAvailableResearch(world.humanPlayer);
        if (available.length === 0) {
            this.processNextEvent();
            return;
        }

        this.state = UIStateType.RESEARCH_SELECTION;
        this.data = {
            options: available,
            onSelect: (tech) => {
                world.humanPlayer.currentResearch = tech.id;
                this.processNextEvent();
            }
        };
        this.notify();
    }

    // Handle research selection
    selectResearch(tech) {
        if (this.state !== UIStateType.RESEARCH_SELECTION) return;
        const onSelect = this.data?.onSelect;
        if (onSelect) {
            onSelect(tech);
        }
    }

    // Find next unit needing orders, or go to TURN_ENDED
    selectNextUnit() {
        if (this.viewCallbacks.stopBlinking) {
            this.viewCallbacks.stopBlinking();
        }

        const unit = world.humanPlayer.units.find(
            u => u.status === UnitStatus.WAITING_ORDERS && u.movesLeft > 0
        );

        if (unit) {
            this.activateUnit(unit);
        } else {
            this.state = UIStateType.TURN_ENDED;
            this.data = null;
            this.notify();
        }
    }

    // Activate a specific unit
    activateUnit(unit) {
        if (unit.status === UnitStatus.FORTIFIED) {
            unit.wake();
        }

        // If unit has no moves, skip to next unit
        if (unit.movesLeft <= 0) {
            this.selectNextUnit();
            return;
        }

        this.state = UIStateType.UNIT_ACTIVE;
        this.data = { unit };
        this.lastUnit = unit;

        if (this.viewCallbacks.centerViewOn) {
            this.viewCallbacks.centerViewOn(unit.x, unit.y);
        }
        if (this.viewCallbacks.startBlinking) {
            this.viewCallbacks.startBlinking(() => {
                if (this.viewCallbacks.render) {
                    this.viewCallbacks.render(unit);
                }
            });
        }
        this.notify();
    }

    // Go back to the unit that was active before a menu, dialog or report, if it still needs orders
    resume() {
        const unit = this.lastUnit;
        if (unit && unit.status === UnitStatus.WAITING_ORDERS && unit.movesLeft > 0 &&
            world.humanPlayer.units.includes(unit)) {
            this.activateUnit(unit);
        } else {
            this.selectNextUnit();
        }
    }

    // menus: [{ title, items: [{ label, key, action, disabled }] }]
    openMenu(menus, index) {
        this.viewCallbacks.stopBlinking?.();
        this.state = UIStateType.MENU;
        this.data = { menus, index: 0, selectedIndex: 0 };
        this.switchMenu(index);
    }

    switchMenu(index) {
        const count = this.data.menus.length;
        this.data.index = (index + count) % count;
        this.data.selectedIndex = this.data.menus[this.data.index].items.findIndex(item => !item.disabled);
        this.notify();
    }

    moveMenuSelection(step) {
        const items = this.data.menus[this.data.index].items;
        let i = this.data.selectedIndex;
        for (let n = 0; n < items.length; n++) {
            i = (i + step + items.length) % items.length;
            if (!items[i].disabled) break;
        }
        this.data.selectedIndex = i;
        this.notify();
    }

    chooseMenuItem(index) {
        if (this.state !== UIStateType.MENU) return;
        const item = this.data.menus[this.data.index].items[index];
        if (!item || item.disabled) return;
        this.data = null;
        this.resume();
        item.action();
    }

    closeMenu() {
        if (this.state !== UIStateType.MENU) return;
        this.data = null;
        this.resume();
    }

    // report: { title, lines, items?, onSelect?, onClose?, worldMap? }
    showReport(report) {
        this.viewCallbacks.stopBlinking?.();
        this.state = UIStateType.REPORT;
        this.data = { selectedIndex: 0, lines: [], ...report };
        this.notify();
    }

    chooseReportItem(index) {
        if (this.state !== UIStateType.REPORT || !this.data.items?.[index]) return;
        const { items, onSelect } = this.data;
        this.data = null;
        this.resume();
        onSelect(items[index].value);
    }

    closeReport() {
        if (this.state !== UIStateType.REPORT) return;
        const onClose = this.data.onClose;
        this.data = null;
        if (onClose) {
            onClose();
        } else {
            this.resume();
        }
    }

    // Open city screen
    openCity(city) {
        if (this.viewCallbacks.stopBlinking) {
            this.viewCallbacks.stopBlinking();
        }
        this.state = UIStateType.CITY_SCREEN;
        this.data = { city };
        this.notify();
    }

    // Close city screen
    closeCity() {
        // Return to unit or turn ended
        this.selectNextUnit();
    }

    // Show change production dialog
    showChangeProduction(city, options, onSelect) {
        this.state = UIStateType.CHANGE_PRODUCTION;
        this.data = { city, options, onSelect };
        this.notify();
    }

    // Handle production selection
    selectProduction(item) {
        if (this.state !== UIStateType.CHANGE_PRODUCTION) return;
        const { city, onSelect } = this.data;
        // Return to city screen
        this.state = UIStateType.CITY_SCREEN;
        this.data = { city };
        if (onSelect) {
            onSelect(item);
        }
        this.notify();
    }

    // Cancel change production (return to city)
    cancelChangeProduction() {
        if (this.state !== UIStateType.CHANGE_PRODUCTION) return;
        const city = this.data?.city;
        this.state = UIStateType.CITY_SCREEN;
        this.data = { city };
        this.notify();
    }

    // Show buy confirmation dialog
    showBuyConfirm(city, item, cost, onConfirm) {
        this.state = UIStateType.BUY_CONFIRM;
        this.data = { city, item, cost, onConfirm };
        this.notify();
    }

    // Confirm purchase
    confirmBuy() {
        if (this.state !== UIStateType.BUY_CONFIRM) return;
        const { city, onConfirm } = this.data;
        // Return to city screen
        this.state = UIStateType.CITY_SCREEN;
        this.data = { city };
        if (onConfirm) {
            onConfirm();
        }
        this.notify();
    }

    // Cancel purchase (return to city)
    cancelBuy() {
        if (this.state !== UIStateType.BUY_CONFIRM) return;
        const city = this.data?.city;
        this.state = UIStateType.CITY_SCREEN;
        this.data = { city };
        this.notify();
    }

    // Show info dialog (dismissable with click/key)
    showInfo(message, onDismiss) {
        this.state = UIStateType.INFO_DIALOG;
        this.data = { message, onDismiss };
        this.notify();
    }

    // Show a list of options; onSelect gets the chosen option's value, or nothing is called on Escape
    showChoice(title, options, onSelect) {
        if (this.viewCallbacks.stopBlinking) {
            this.viewCallbacks.stopBlinking();
        }
        this.state = UIStateType.CHOICE_DIALOG;
        this.data = { title, options, onSelect, selectedIndex: 0 };
        this.notify();
    }

    chooseOption(index) {
        if (this.state !== UIStateType.CHOICE_DIALOG) return;
        const { options, onSelect } = this.data;
        this.data = null;
        this.resume();
        onSelect(options[index].value);
    }

    cancelChoice() {
        if (this.state !== UIStateType.CHOICE_DIALOG) return;
        this.data = null;
        this.resume();
    }

    // Dismiss current info dialog
    dismissInfo() {
        if (this.state !== UIStateType.INFO_DIALOG) return;
        const onDismiss = this.data?.onDismiss;
        this.data = null;
        if (onDismiss) {
            onDismiss();
        } else {
            this.processNextEvent();
        }
    }

    // Handle click input - returns true if handled
    handleClick(screenX, screenY, mapX, mapY, clickTarget) {
        switch (this.state) {
            case UIStateType.INFO_DIALOG:
                this.dismissInfo();
                return true;

            case UIStateType.TECH_DISCOVERY:
                this.closeTechDiscovery();
                return true;

            case UIStateType.RESEARCH_SELECTION:
                // Handle research selection (view.js detects which option clicked)
                if (clickTarget?.type === 'research') {
                    this.selectResearch(clickTarget.tech);
                    return true;
                }
                return false;

            case UIStateType.CHANGE_PRODUCTION:
                if (clickTarget?.type === 'production') {
                    this.selectProduction(clickTarget.item);
                    return true;
                }
                if (clickTarget?.type === 'cancel') {
                    this.cancelChangeProduction();
                    return true;
                }
                return false;

            case UIStateType.BUY_CONFIRM:
                if (clickTarget?.type === 'confirm') {
                    this.confirmBuy();
                    return true;
                }
                if (clickTarget?.type === 'cancel') {
                    this.cancelBuy();
                    return true;
                }
                return false;

            case UIStateType.CHOICE_DIALOG:
                if (clickTarget?.type === 'choice') {
                    this.chooseOption(clickTarget.index);
                    return true;
                }
                return false;

            case UIStateType.CITY_SCREEN:
                // Handle city screen clicks (view.js detects buttons)
                if (clickTarget?.type === 'exit' || clickTarget === 'exit') {
                    this.closeCity();
                    return true;
                }
                // Other city actions handled by view/citymanagement
                return false;

            case UIStateType.UNIT_ACTIVE:
                // Click on city opens it
                const city = world.getCityAt(mapX, mapY);
                if (city && city.player === world.humanPlayer.id) {
                    this.openCity(city);
                    return true;
                }
                // Click on unit selects it
                const units = world.getUnitsAt(mapX, mapY);
                const humanUnit = units.find(u => u.player === world.humanPlayer.id);
                if (humanUnit && humanUnit !== this.data.unit) {
                    this.activateUnit(humanUnit);
                    return true;
                }
                // Movement handled elsewhere
                return false;

            case UIStateType.TURN_ENDED:
                // Click on city opens it
                const clickedCity = world.getCityAt(mapX, mapY);
                if (clickedCity && clickedCity.player === world.humanPlayer.id) {
                    this.openCity(clickedCity);
                    return true;
                }
                // Click on unit activates it
                const clickedUnits = world.getUnitsAt(mapX, mapY);
                const clickedUnit = clickedUnits.find(u => u.player === world.humanPlayer.id);
                if (clickedUnit) {
                    this.activateUnit(clickedUnit);
                    return true;
                }
                return false;

            default:
                return false;
        }
    }

    // Handle key input - returns true if handled
    handleKey(key) {
        switch (this.state) {
            case UIStateType.INFO_DIALOG:
                // Any key dismisses
                this.dismissInfo();
                return true;

            case UIStateType.TECH_DISCOVERY:
                // Any key dismisses
                this.closeTechDiscovery();
                return true;

            case UIStateType.RESEARCH_SELECTION:
                if (key === 'Escape') {
                    // Can't cancel research selection - must choose
                    return true;
                }
                // Arrow keys, Enter handled by view for selection
                return false;

            case UIStateType.CHANGE_PRODUCTION:
                if (key === 'Escape') {
                    this.cancelChangeProduction();
                    return true;
                }
                // Arrow keys, Enter handled by view for selection
                return false;

            case UIStateType.BUY_CONFIRM:
                if (key === 'Escape' || key === 'n' || key === 'N') {
                    this.cancelBuy();
                    return true;
                }
                if (key === 'Enter' || key === 'y' || key === 'Y') {
                    this.confirmBuy();
                    return true;
                }
                return false;

            case UIStateType.CHOICE_DIALOG: {
                const count = this.data.options.length;
                if (key === 'ArrowUp' || key === 'ArrowDown') {
                    this.data.selectedIndex = (this.data.selectedIndex + (key === 'ArrowUp' ? count - 1 : 1)) % count;
                    this.notify();
                } else if (key === 'Enter' || key === ' ') {
                    this.chooseOption(this.data.selectedIndex);
                } else if (key === 'Escape') {
                    this.cancelChoice();
                }
                return true;
            }

            case UIStateType.MENU: {
                const items = this.data.menus[this.data.index].items;
                const shortcut = items.findIndex(item => item.key === key && !item.disabled);
                if (key === 'ArrowUp' || key === 'ArrowDown') {
                    this.moveMenuSelection(key === 'ArrowUp' ? -1 : 1);
                } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
                    this.switchMenu(this.data.index + (key === 'ArrowLeft' ? -1 : 1));
                } else if (key === 'Enter') {
                    this.chooseMenuItem(this.data.selectedIndex);
                } else if (key === 'Escape') {
                    this.closeMenu();
                } else if (shortcut >= 0) {
                    this.chooseMenuItem(shortcut);
                }
                return true;
            }

            case UIStateType.REPORT: {
                const count = this.data.items?.length || 0;
                if (count && (key === 'ArrowUp' || key === 'ArrowDown')) {
                    this.data.selectedIndex = (this.data.selectedIndex + (key === 'ArrowUp' ? count - 1 : 1)) % count;
                    this.notify();
                } else if (count && key === 'Enter') {
                    this.chooseReportItem(this.data.selectedIndex);
                } else if (!count || key === 'Escape') {
                    this.closeReport();
                }
                return true;
            }

            case UIStateType.CITY_SCREEN:
                if (key === 'Escape') {
                    this.closeCity();
                    return true;
                }
                return false;

            case UIStateType.UNIT_ACTIVE:
                const unit = this.data?.unit;
                if (!unit) return false;

                if (key === 'Enter' && unit.movesLeft <= 0) {
                    // Unit has no moves - allow ending turn
                    this.endTurn();
                    return true;
                }
                // Movement keys handled elsewhere
                return false;

            case UIStateType.TURN_ENDED:
                if (key === 'Enter') {
                    this.endTurn();
                    return true;
                }
                return false;

            default:
                return false;
        }
    }

    // Notify listeners of state change
    notify() {
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }

    // Called when unit finishes moving
    unitMoved(unit) {
        if (unit.movesLeft <= 0) {
            unit.status = UnitStatus.DONE;
        }
        // Check if still the active unit
        if (this.state === UIStateType.UNIT_ACTIVE && this.data?.unit === unit) {
            if (unit.status !== UnitStatus.WAITING_ORDERS || unit.movesLeft <= 0) {
                this.selectNextUnit();
            } else {
                // Unit can still move - restart blinking
                if (this.viewCallbacks.startBlinking) {
                    this.viewCallbacks.startBlinking(() => {
                        if (this.viewCallbacks.render) {
                            this.viewCallbacks.render(unit);
                        }
                    });
                }
                this.notify();
            }
        }
    }
}

// Singleton instance
export const uiState = new UIStateMachine();
