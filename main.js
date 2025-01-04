// TODO: prevent first-click lose?

CellSpecialValue = Object.freeze({
    mine: "mine",
    flag: "flag",
    unFlag: "unflag",
})

const GameState = Object.freeze({
    start: 0,
    play: 1,
    finish: 2,
})


class Field {
    MINE = -1
    constructor(setup) {
        const { x, y, mines } = setup;
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
            const index = this.getRandomInt(emptyCells.length)
            const mineIndex = emptyCells[index];
            this.r[mineIndex] = this.MINE;
            mineIndices.push(mineIndex);
            emptyCells.splice(index, 1);
        }

        // fil numbers
        for (let mineIndex of mineIndices) {
            for (let index of this._index2neighbors(mineIndex)) {
                if (this.r[index] === this.MINE) continue;
                this.r[index] += 1;
            }
        }

        this.mineIndices = mineIndices;
    }

    getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    _index2posUnsafe(index) {  // return (x, y)
        return [index % this.x, Math.floor(index / this.x)];
    }
    _pos2indexUnsafe(x, y) {
        return x + this.x * y;
    }
    _isValidPos(x, y) {
        if (x < 0 || y < 0) return false;
        if (x >= this.x || y >= this.y) return false;
        return true;
    }
    _index2neighbors(index) {
        const [x, y] = this._index2posUnsafe(index);
        const neightbors = [];

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i == 0 && j == 0) continue;
                const xm = x + i;
                const ym = y + j;
                if (this._isValidPos(xm, ym)) {
                    neightbors.push(this._pos2indexUnsafe(xm, ym));
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

    findCellsToOpenAroundEmptyCell(index) {
        const toVisit = new Set([index])
        const found = {}

        // relying on set can change size during iteration
        for (let index of toVisit) {
            const value = this.r[index]
            if (!found[value]) found[value] = []
            found[value].push(index)

            if (value == 0) {  // look for neighbors only if its also an empty cell
                for (let newIndex of this._index2neighbors(index)) {
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
        const { mines, field } = setup;
        this.setViewHandlers(viewHandlers);
        this.totalMines = mines;
        this.field = field || new Field(setup);

        this.cellsWithoutMines = this.field.totalCells - this.totalMines
        this.openCells = new Set()
        this.flagCells = new Set()

        this.gameState = GameState.start

        this.updateRemainingFlags();

        this.playedSec = 0;
    }

    setViewHandlers(viewHandlers) {
        this.view = {
            reveal: viewHandlers.revealCell,
            setBatch: viewHandlers.setBatchRawValue,
            setRemainingFlags: viewHandlers.setRemainingFlags,
            setStopwatch: viewHandlers.setStopwatch,
        }
    }

    onClick(event) {
        switch (this.gameState) {
            case GameState.finish:
                return;
            case GameState.start:
                this.gameState = GameState.play;
                this.startGameFirstAction()
                break;
        }

        const { index, isFlag } = event;

        if (isFlag) {
            if (this.openCells.has(index)) {
                return;
            }
            if (this.flagCells.has(index)) {
                this.flagCells.delete(index)
                this.view.reveal(event, CellSpecialValue.unFlag)
            } else {
                this.flagCells.add(index)
                this.view.reveal(event, CellSpecialValue.flag)
            }
            this.updateRemainingFlags();
            return;
        }

        const cellValue = this.field.open(index);
        this.openCells.add(index)
        this.view.reveal(event, cellValue);

        if (cellValue === CellSpecialValue.mine) {
            this.lose()
            return
        }

        if (cellValue === 0) {
            const value2indices = this.field.findCellsToOpenAroundEmptyCell(index)
            for (let value of Object.keys(value2indices)) {
                for (let index of value2indices[value]) {
                    this.view.reveal({ index }, parseInt(value));
                    this.openCells.add(index)
                }
            }
        }

        if (this.isWin()) {
            this.win()
            return
        }
        this.gameState = GameState.play
        this.updateRemainingFlags()
    }

    updateRemainingFlags() {
        for (const index of this.flagCells.keys()) {
            if (this.openCells.has(index)) {
                this.flagCells.delete(index);
            }
        }
        this.view.setRemainingFlags(this.totalMines - this.flagCells.size)
    }

    isWin() {
        return this.openCells.size === this.cellsWithoutMines
    }

    startGameFirstAction() {
        this._startStopwatch()
    }

    stopwatchTick() {
        if (this.gameState == GameState.finishGame) {
            this._stopStopwatch()
            return
        }
        this.playedSec += 1;
        this.view.setStopwatch(this.playedSec)
    }

    _startStopwatch() {
        this._stopwatchId = setInterval(this.stopwatchTick.bind(this), 1000)
    }
    _stopStopwatch() {
        clearInterval(this._stopwatchId)
    }

    finishGame() {
        this.gameState = GameState.finish
        this.view.setBatch(this.field.mineIndices, CellSpecialValue.mine)
        this._stopStopwatch()
    }

    lose() {
        this.finishGame()
        setTimeout(() => alert("you lose"), 1)
    }

    win() {
        this.finishGame()
        setTimeout(() => alert("you win"), 1)
    }

    clear() {  // stop timers
        this._stopStopwatch()
    }
}


class GameView {
    constructor(uiElements, setup) {
        const {
            gameFieldElement,
            remainingFlagsElement,
            stopwatchElement,
        } = uiElements;

        this.index2element = {}
        this.resizeField(gameFieldElement, setup);

        this.remainingFlagsElement = remainingFlagsElement;
        this.stopwatchElement = stopwatchElement

        this.setStopwatch(0)
        this.setRemainingFlags(0)
    }

    setCallback({ onClick }) {
        this.engineClickHandler = onClick;
    }

    resizeField(parent, setup) {  // static
        // probably move to wrapper class

        const { x, y } = setup;
        console.assert(x > 0 && y > 0, `resizeField: invalid x or y values: ${x} ${y}`)

        parent.style.gridTemplateColumns = "1fr ".repeat(x);
        parent.innerHTML = "";

        const r = [];
        for (let i = parent.childElementCount; i < x * y; i++) {
            const elem = document.createElement("div");
            elem.className = "cell";
            elem.addEventListener("click", this.onCellLeftClick.bind(this));
            elem.addEventListener("contextmenu", this.onCellRightClick.bind(this));
            elem.dataset.index = i;
            r.push(elem)
            this.index2element[i] = elem;
        }
        parent.append.apply(parent, r)
    }

    onCellLeftClick(e) {
        this.onCellClick(e, false);
    }
    onCellRightClick(e) {
        this.onCellClick(e, true);
    }

    onCellClick(e, rightClick) {
        e.preventDefault();

        const target = e.target;
        const index = parseInt(target.dataset.index);

        this.engineClickHandler({ index, target, isFlag: rightClick })
    }

    _value2symbol(value) {
        switch (value) {
            case CellSpecialValue.mine:
                return "*";
            case CellSpecialValue.flag:
                return "&#128681;";
            case CellSpecialValue.unFlag:
                return "";
            case 0:
            case "0":
                return "";  // draw nothing on zero
            default:
                return value;
        }
    }

    revealValue({ index }, value) {
        const target = this.index2element[index]
        let assign = this._value2symbol(value);
        let className = null;
        switch (value) {
            case CellSpecialValue.mine:
                className = "valmine";
                break;
            case CellSpecialValue.flag:
                className = "valflag";
                break;
            default:
                className = "val" + value
        }
        target.innerHTML = assign;
        target.classList.remove("valflag")  // any value can replace flag
        if (className) {
            target.classList.add("cell", className)
        }
    }

    setBatchRawValue(indices, value) {
        for (let index of indices) {
            const target = this.index2element[index]
            target.innerHTML = this._value2symbol(value);
        }
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


class OptionsFormController {
    constructor({ newGame }) {
        // FIXME: autogenerate options html-element based on this:
        this.levels = {
            easiest: { x: 10, y: 10, mines: 10 },
            easy: { x: 9, y: 9, mines: 10 },
            medium: { x: 16, y: 16, mines: 40 },
            hard: { x: 30, y: 16, mines: 99 },
        };
        this.defaultLevel = "easy";

        this.lastConfig = this.levels.easy

        this.newGameHandler = newGame
    }

    onSubmit(event) {
        if (event.submitter?.value !== "accept") {
            return
        }
        const { target } = event
        const difficulty = target.elements["difficulty"].value || this.defaultLevel

        let config = this.levels[difficulty]
        if (!config) {
            const x = parseInt(target.elements["width"].value);
            const y = parseInt(target.elements["height"].value);
            const mines = parseInt(target.elements["mines"].value);

            if (x < 1 || y < 1 || mines < 1) {
                alert(`invalid parameters, custom values must be greater than 1`)
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
        this.lastConfig = config || this.lastConfig;
        this.newGameHandler(this.lastConfig)
    }
}


window.addEventListener("load", () => {

    const gameFieldElement = document.getElementById("game-field");
    const remainingFlagsElement = document.getElementById("remaining-flags")
    const stopwatchElement = document.getElementById("stopwatch")

    function newGame(config) {
        if (this._oldGame !== undefined) {  // dirty hack to clear old timers on reset
            this._oldGame.clear()
        }

        const view = new GameView({ gameFieldElement, remainingFlagsElement, stopwatchElement }, config)
        const game = new GameEngine(
            config,
            {
                revealCell: view.revealValue.bind(view),
                setBatchRawValue: view.setBatchRawValue.bind(view),
                setRemainingFlags: view.setRemainingFlags.bind(view),
                setStopwatch: view.setStopwatch.bind(view),
            }
        );
        view.setCallback({ onClick: game.onClick.bind(game) })

        this._oldGame = game;

        // debug:
        if (window.debug) {
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
    }

    const options = new OptionsFormController({ newGame });
    document.getElementById("options-form").addEventListener("submit", options.onSubmit.bind(options))
    document.getElementById("new-game").addEventListener("click", options.startNewGame.bind(options))

    options.startNewGame.bind(options)()
});

