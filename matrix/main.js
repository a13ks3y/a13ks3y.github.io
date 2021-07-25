const o_O = '', O_o = '\n', O_O = ' ', o_o = '&nbsp;';  // just for fun ;)
const neo = 0, one = 1, trinity = 3, morfius = 6, NOW = 999, GloryToSatan = 666;
// @todo: get all code, not only current file
fetch('main.js')
.then(r => r.text())
.then(code => {
    const rows = code.split(O_o).map(row => row.split(o_O));
    const theLongestRow = rows.slice().sort((a, b) => b.length - a.length)[0];
    const colsCount = theLongestRow.length;
    const size = Math.floor(window.screen.availWidth / colsCount);
    const rowsCount = Math.floor(window.screen.availHeight / size);
    
    const mainEl = document.getElementById('main');
    document.body.parentElement.style.fontSize = size + 'px';

    // todo draw fucking matrix

    const columns = [];
    for (let colIndex = 0; colIndex < colsCount; colIndex++) {
        const column = { chars: [], columnEl: document.createElement('div') };
        for (let rowIndex = 0; rowIndex < rowsCount; rowIndex++) {
            let char;
            if (rows[rowIndex] && rows[rowIndex][colIndex]) {
                char = rows[rowIndex][colIndex];
            } else {
                char = O_O;
            }
            char = char === O_O ? o_o : char;
            const el = document.createElement('span');
            el.innerHTML = char;
            column.columnEl.appendChild(el);
            column.chars.push({
                char, rowIndex, colIndex, el
            });
        }
        mainEl.appendChild(column.columnEl);
        columns.push(column);
    }
    const initialDrop = {
        rowIndex: 0,
        colIndex: 0,
        dropLength: 9
    };
    const randomRowIndex = (offset) => offset + Math.floor(Math.random() * (rowsCount / 6)) + 6;
    const drops = Array(colsCount).fill(JSON.stringify(initialDrop)).map((drop, dropIndex) => { 
        return Object.assign(JSON.parse(drop), {
            colIndex: dropIndex,
            rowIndex: randomRowIndex(0),            
        });
    });
    function rain(rainIndex) {
        console.log('strat rain itreation #', rainIndex);
        drops.forEach(drop => {
            const column = columns[drop.colIndex];
            if (column) {
                const els = Array.from(column.columnEl.querySelectorAll('.fadeInOut'));
                //els.forEach(el => el.classList.remove('fadeInOut'));
                
                let i;
                for (i = drop.dropLength; i > 0; i--) {
                    const char = column.chars[drop.rowIndex + i];
                    if (char) {
                        setTimeout(() => {
                            char.el.classList.add('fadeInOut');                    
                        }, NOW * i);
                    } else {
                        //drop.rowIndex = randomRowIndex(-6);
                    }                        
                }
                setTimeout(() => {
                    drop.rowIndex = drop.rowIndex < rowsCount - 9 ? drop.rowIndex + one : neo;
                    rain(rainIndex + 1);                    
                }, NOW * i * 3);
            }
        });
        console.log('end rain operation #', rainIndex);
    }
    rain(0);
});