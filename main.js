const CellSpecialValue = Object.freeze({
    mine: "*",
    flag: "!",
})


class Field {
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
            this.r[mineIndex] = -1;
            mineIndices.push(mineIndex);
            emptyCells.splice(index, 1);
        }

        // fil numbers
        for (let mineIndex of mineIndices) {
            for (let index of this._index2neighbors(mineIndex)) {
                if (this.r[index] === -1) continue;
                this.r[index] += 1;
            }
        }
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
        if (this.r[index] === -1) {
            return CellSpecialValue.mine
        }
        return this.r[index];
    }

    findCellsToOpenAroundEmptyCell(index) {
        const toVisit = new Set([index])
        const found = {}

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
    constructor(setup) {
        const { mines, field } = setup;
        this.totalMines = mines;
        this.field = field || new Field(setup);

        this.cellsWithoutMines = this.field.totalCells - this.totalMines
        this.openCells = new Set()

        this.view = {};
    }

    setViewHandlers(viewHandlers) {
        ({
            reset: this.view.reset,
            set: this.view.set,
        } = viewHandlers)
    }

    onClick(event) {
        const { index, isFlag } = event;

        if (isFlag) {
            this.view.set(event, CellSpecialValue.flag)  // TODO: forbid flag on open cell
            return;
        }

        const cellValue = this.field.open(index);
        this.openCells.add(index)
        this.view.set(event, cellValue);

        if (cellValue === CellSpecialValue.mine) {
            this.lose()
            return
        }

        if (cellValue === 0) {
            const value2indices = this.field.findCellsToOpenAroundEmptyCell(index)
            for (let value of Object.keys(value2indices)) {
                for (let index of value2indices[value]) {
                    this.view.set({ index }, parseInt(value));
                    this.openCells.add(index)
                }
            }
        }

        if (this.isWin()) {
            this.win()
        }
    }

    isWin() {
        return this.openCells.size === this.cellsWithoutMines
    }

    lose() { // TODO: stop processing after finish
        setTimeout(()=>alert("you lose"), 1)
    }

    win() {
        console.log("you win")
        setTimeout(() => alert("you win"), 1)  // otherwise - field not updated
    }
}


class GameView {
    constructor(gameField, setup) {
        const { onClick: engineClickHandler } = setup;
        console.assert(engineClickHandler, "GameView: onClick not passed")
        this.engineClickHandler = engineClickHandler;

        this.index2element = {}
        this.resizeField(gameField, setup);
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

    setValue({ index }, value) {
        const target = this.index2element[index]
        let assign = "";
        let className = null;
        switch (value) {
            case CellSpecialValue.mine:
                assign = "*";
                className = "valmine";
                break;
            case CellSpecialValue.flag:
                className = "valflag"
                assign = "!";
                if (target.classList.contains(className)){
                    className = null;
                    assign = "";
                }
                break;
            case 0:
            case "0":
                assign = "";
                className = "val0"
                break
            default:
                assign = value;
                className = "val" + value
        }
        target.innerHTML = assign;
        target.classList.remove("valflag")
        if (className) {
            target.classList.add("cell", className)
        }
    }

    resetField() {
        console.log("resetField")
    }
}



window.addEventListener("load", () => {

    const gameFieldElement = document.getElementById("game-field");

    function newGame() {
        //const config = { x: 8, y: 8, mines: 10 }
        //const config = { x: 9, y: 9, mines: 10 }
        //const config = { x: 10, y: 10, mines: 10 }
        //const config = { x: 16, y: 16, mines: 40 }
        const config = { x: 30, y: 16, mines: 99 }
        // const config = { x: 10, y: 10, mines: 2 }
        // const config = { x: 4, y: 4, mines: 2 }


        const game = new GameEngine(config);
        const view = new GameView(gameFieldElement, { ...config, onClick: game.onClick.bind(game) })
        game.setViewHandlers({
            set: view.setValue.bind(view),
            reset: view.resetField.bind(view),
        })

        let s = "";
        for (let i = 0; i < config.x * config.y; i++) {
            if (!(i % config.x)) {
                s += "\n";
            }
            s += ('' + game.field.r[i]).padStart(3, " ")
        }
        console.log(s)
    }

    document.getElementById("new-game").addEventListener("click", newGame)
    newGame()
});

