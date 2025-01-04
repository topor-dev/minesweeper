// TODO: prevent first-click lose? then restrict: mines < x*y

CellSpecialValue = Object.freeze({
    MINE: "mine",
    FLAG: "flag",
    UNFLAG: "UNFLAG",
})

const GameState = Object.freeze({
    START: 0,
    PLAY: 1,
    FINISH: 2,
})

const DifficultyLevels = Object.freeze({
    easiest: { x: 10, y: 10, mines: 10 },
    easy: { x: 9, y: 9, mines: 10 },
    medium: { x: 16, y: 16, mines: 40 },
    hard: { x: 30, y: 16, mines: 99 },
})


class Field {
    MINE = -1
    constructor({ x, y, mines }) {
        this.x = x;
        this.y = y;
        const totalCells = x * y;
        this.totalCells = totalCells;
        console.assert(totalCells >= mines, "too many mines, exceed cell number")

        this.r = Array(totalCells).fill(0);

        // gen mines:
        const emptyCells = Array(totalCells);
        const mineIndices = Array();
        for (let i = 0; i < totalCells; i++) {
            emptyCells[i] = i;
        }
        for (let i = 0; i < mines; i++) {
            const index = this.getRandomInt_(emptyCells.length)
            const mineIndex = emptyCells[index];
            this.r[mineIndex] = this.MINE;
            mineIndices.push(mineIndex);
            emptyCells.splice(index, 1);
        }

        // fil numbers
        for (let mineIndex of mineIndices) {
            for (let index of this.getNeighborsByIndex_(mineIndex)) {
                if (this.r[index] === this.MINE) continue;
                this.r[index] += 1;
            }
        }

        this.mineIndices = mineIndices;
    }

    getRandomInt_(max) {
        return Math.floor(Math.random() * max);
    }

    convertIndex2posUnsafe_(index) {  // return (x, y)
        return [index % this.x, Math.floor(index / this.x)];
    }

    convertPos2indexUnsafe_(x, y) {
        return x + this.x * y;
    }
    isValidPos_(x, y) {
        if (x < 0 || y < 0) return false;
        if (x >= this.x || y >= this.y) return false;
        return true;
    }
    getNeighborsByIndex_(index) {
        const [x, y] = this.convertIndex2posUnsafe_(index);
        const neightbors = [];

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i == 0 && j == 0) continue;
                const xm = x + i;
                const ym = y + j;
                if (this.isValidPos_(xm, ym)) {
                    neightbors.push(this.convertPos2indexUnsafe_(xm, ym));
                }
            }
        }
        return neightbors;
    }

    open(index) {
        if (this.r[index] === this.MINE) {
            return CellSpecialValue.mine
        }
        return this.r[index];
    }

    findCellsToOpenAroundEmptyCell_(/** @type {number} */ index) {
        const toVisit = new Set([index])
        /** @type {object.<string, Array<number>>} */
        const found = {}

        // relying on set can change size during iteration
        for (let index of toVisit) {
            const value = this.r[index]
            if (!found[value]) found[value] = []
            found[value].push(index)

            if (value == 0) {  // look for neighbors only if its also an empty cell
                for (let newIndex of this.getNeighborsByIndex_(index)) {
                    if (toVisit.has(newIndex)) continue;
                    toVisit.add(newIndex)
                }
            }
        }
        return found;
    }
}

class GameEngine {
    constructor(setup, viewHandlers) {
        const { mines } = setup;

        this.totalMines = mines;
        this.field = new Field(setup);

        this.cellsWithoutMines = this.field.totalCells - this.totalMines
        this.openCells = new Set()
        this.flagCells = new Set()
        this.playedSec = 0;
        this.gameState = GameState.START

        this.setViewHandlers_(viewHandlers);

        this.updateRemainingFlags_();
        this.setStopwatch_(0)
    }

    setViewHandlers_({ revealCell, setRemainingFlags, setStopwatch, showWin, showLose }) {
        this.view = {
            revealCell,
            setRemainingFlags,
            setStopwatch,
            showWin,
            showLose,
        }
    }

    toggleFlagCell_(index) {
        if (this.openCells.has(index)) {
            return;
        }
        if (this.flagCells.has(index)) {
            this.flagCells.delete(index)
            this.view.revealCell({ index }, CellSpecialValue.UNFLAG)
        } else {
            this.flagCells.add(index)
            this.view.revealCell({ index }, CellSpecialValue.FLAG)
        }
        this.updateRemainingFlags_();
    }

    openCell_(index) {
        const cellValue = this.field.open(index);
        this.openCells.add(index)
        this.view.revealCell({ index }, cellValue);

        if (cellValue === 0) {
            const value2indices = this.field.findCellsToOpenAroundEmptyCell_(index)
            for (let value of Object.keys(value2indices)) {
                for (let index of value2indices[value]) {
                    this.view.revealCell({ index }, parseInt(value));
                    this.openCells.add(index)
                }
            }
        }
        return cellValue;
    }

    onClick(event) {
        switch (this.gameState) {
            case GameState.FINISH:
                return;
            case GameState.START:
                this.gameState = GameState.PLAY;
                this.startGameFirstAction_()
                break;
        }
        this.gameState = GameState.PLAY

        const { index, isFlag } = event;

        if (isFlag) {
            this.toggleFlagCell_(index)
            return;
        }

        const cellValue = this.openCell_(index)

        if (cellValue === CellSpecialValue.mine) {
            this.lose_()
            return
        }
        if (this.isWin_()) {
            this.win_()
            return
        }
        this.updateRemainingFlags_()
    }

    updateRemainingFlags_() {
        for (const index of this.flagCells.keys()) {
            if (this.openCells.has(index)) {
                this.flagCells.delete(index);
            }
        }
        this.view.setRemainingFlags(this.totalMines - this.flagCells.size)
    }

    isWin_() {
        return this.openCells.size === this.cellsWithoutMines
    }

    startGameFirstAction_() {
        this.startStopwatch_()
    }

    stopwatchTick_() {
        if (this.gameState == GameState.finishGame) {
            this.stopStopwatch_()
            return
        }
        this.playedSec += 1;
        this.setStopwatch_(this.playedSec)
    }

    setStopwatch_(number) {
        this.view.setStopwatch(number)
    }

    startStopwatch_() {
        this._stopwatchId = setInterval(this.stopwatchTick_.bind(this), 1000)
    }
    stopStopwatch_() {
        clearInterval(this._stopwatchId)
    }

    finishGame_() {
        this.gameState = GameState.FINISH
        this.stopStopwatch_()
    }

    lose_() {
        this.finishGame_()
        this.view.showLose(this.field.mineIndices)
    }

    win_() {
        this.finishGame_()
        this.view.showWin(this.field.mineIndices)
    }

    clear() {  // stop timers
        this.stopStopwatch_()
    }
}


class GameView {
    constructor(uiElements) {
        const {
            gameFieldElement,
            remainingFlagsElement,
            stopwatchElement,
        } = uiElements;

        this.index2cellHTMLElement = {}

        this.gameFieldElement = gameFieldElement
        this.remainingFlagsElement = remainingFlagsElement;
        this.stopwatchElement = stopwatchElement

        this.resetField({ x: 9, y: 9 });
        this.setStopwatch(0)
        this.setRemainingFlags(0)
    }

    setCallbacks({ onClick }) {
        this.engineClickHandler = onClick;
    }

    resetField({ x, y }) {
        console.assert(x > 0 && y > 0, `resetField: invalid x or y values: ${x} ${y}`)

        this.gameFieldElement.style.gridTemplateColumns = "1fr ".repeat(x);
        this.gameFieldElement.innerHTML = "";
        this.index2cellHTMLElement = {}

        const r = [];
        for (let i = 0; i < x * y; i++) {
            const elem = document.createElement("div");
            elem.className = "cell";
            elem.addEventListener("click", this.onCellLeftClick_.bind(this));
            elem.addEventListener("contextmenu", this.onCellRightClick_.bind(this));
            elem.dataset.index = i;
            r.push(elem)
            this.index2cellHTMLElement[i] = elem;
        }
        this.gameFieldElement.append.apply(this.gameFieldElement, r)
    }

    onCellLeftClick_(e) {
        this.onCellClick_(e, false);
    }
    onCellRightClick_(e) {
        this.onCellClick_(e, true);
    }

    onCellClick_(e, rightClick) {
        e.preventDefault();

        this.engineClickHandler({
            index: parseInt(e.target.dataset.index),
            isFlag: rightClick,
        })
    }

    value2symbol_(value) {
        switch (value) {
            case CellSpecialValue.mine:
                return "*";
            case CellSpecialValue.FLAG:
                return "&#128681;";
            case CellSpecialValue.UNFLAG:
                return "";
            case 0:
            case "0":
                return "";  // draw nothing on zero
            default:
                return value;
        }
    }

    revealCell({ index }, value) {
        const target = this.index2cellHTMLElement[index]
        let className = null;
        switch (value) {
            case CellSpecialValue.mine:
                className = "valmine";
                break;
            case CellSpecialValue.FLAG:
                className = "valflag";
                break;
            default:
                className = "val" + value
        }
        target.innerHTML = this.value2symbol_(value);
        target.classList.remove("valflag")  // any value can replace flag
        if (className) {
            target.classList.add(className)
        }
    }

    showMines_(indices) {
        for (let index of indices) {
            const target = this.index2cellHTMLElement[index]
            target.innerHTML = this.value2symbol_(CellSpecialValue.mine);
        }
    }

    showWin(mineIndices) {
        this.showMines_(mineIndices);
        setTimeout(() => alert("you win"), 1)
    }

    showLose(mineIndices) {
        this.showMines_(mineIndices);
        setTimeout(() => alert("you lost"), 1)
    }

    setRemainingFlags(number) {
        let value;
        if (number < 0) {
            value = `&#8211;${('' + (-number)).padStart(2, "0")}`
        } else {
            value = ('' + number).padStart(3, "0")
        }
        this.remainingFlagsElement.innerHTML = value;
    }

    setStopwatch(number) {
        this.stopwatchElement.innerHTML = ('' + number).padStart(3, "0")
    }
}

const foo = 42

// FIXME: extract predefined configs
class OptionsFormController {
    constructor({ newGame, difficultyLevels }) {
        // TODO: autogenerate options html-element based on this:
        this.levels = difficultyLevels;
        this.newGameCallback = newGame
    }

    get defaultConfig() {
        return this.levels.easiest;
    }

    onSubmit(event) {
        if (event.submitter?.value !== "accept") {
            return
        }
        const { target } = event
        const difficulty = target.elements["difficulty"].value;  // might be custom (not in levels)

        let config = this.levels[difficulty]
        if (!config) {
            const x = parseInt(target.elements["width"].value);
            const y = parseInt(target.elements["height"].value);
            const mines = parseInt(target.elements["mines"].value);

            if (x < 1 || y < 1 || mines < 1) {
                alert(`invalid parameters, custom values must be greater than or equal to 1`)
                event.preventDefault();
                return;
            }
            if (x * y < mines) {
                alert(`too many mines, maximum for ${x}x${y} is ${x * y} mines`)
                event.preventDefault();
                return;
            }

            config = { x, y, mines }
        }
        this.startNewGame({ config })
    }

    startNewGame(params) {
        const { config } = params || {};
        this.newGameCallback(config)
    }
}

class GameSessionHolder {
    constructor(view) {
        this.lastGame = null;
        this.lastConfig = null;

        this.view = view;
    }

    playAgain() {
        this.lastGame?.clear();
        console.assert(this.lastConfig, "playAgain: lastConfig is not set, probably need to call applyConfigAndPlay")
        const config = this.lastConfig;
        const view = this.view

        view.resetField(config);

        const game = new GameEngine(
            config,
            {
                revealCell: view.revealCell.bind(view),
                setRemainingFlags: view.setRemainingFlags.bind(view),
                setStopwatch: view.setStopwatch.bind(view),
                showWin: view.showWin.bind(view),
                showLose: view.showLose.bind(view),
            }
        );
        view.setCallbacks({ onClick: game.onClick.bind(game) })

        this.lastGame = game;

        // debug:
        if (window?.debug) {
            let s = "";
            for (let i = 0; i < config.x * config.y; i++) {
                if (!(i % config.x)) {
                    s += "\n";
                }
                s += ('' + game.field.r[i])
                    .replace(game.field.MINE, "*")
                    .replace("0", "_")
                    .padStart(2, " ")
            }
            console.log(s)
        }
        // end debug
    }

    applyConfigAndPlay(config) {
        this.lastConfig = config;
        this.playAgain();
    }
}

function populateHTMLDifficultyVariants(parent, difficultyLevels) {
    const r = [];
    let checked = true;
    for (const [levelName, config] of Object.entries(difficultyLevels)){
        //label><input type="radio" name="difficulty" value="easiest" checked/>easiest (10x10x10)</label>
        const input = document.createElement("input")
        input.type = "radio";
        input.name = "difficulty";
        input.value = levelName;
        input.checked = checked;
        checked = false;
        const label = document.createElement("label");
        label.append(input, `${levelName} (${config.x}x${config.y}x${config.mines})`)
        r.push(label);
    }
    parent.innerHTML = [];
    parent.append.apply(parent, r)
}


window.addEventListener("load", () => {
    const gameFieldElement = document.getElementById("game-field");
    const remainingFlagsElement = document.getElementById("remaining-flags")
    const stopwatchElement = document.getElementById("stopwatch")

    const view = new GameView({ gameFieldElement, remainingFlagsElement, stopwatchElement })
    const gameSessionsHolder = new GameSessionHolder(view);

    populateHTMLDifficultyVariants(
        document.querySelector(".difficulty-predefined>.placeholder"),
        DifficultyLevels,
    )

    const optionsController = new OptionsFormController({
        newGame: gameSessionsHolder.applyConfigAndPlay.bind(gameSessionsHolder),
        difficultyLevels: DifficultyLevels,
    });

    document.getElementById("options-form").addEventListener("submit", optionsController.onSubmit.bind(optionsController))
    document.getElementById("new-game").addEventListener("click", gameSessionsHolder.playAgain.bind(gameSessionsHolder))

    gameSessionsHolder.applyConfigAndPlay(optionsController.defaultConfig)
});

