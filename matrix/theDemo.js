const o_O = '', O_o = '\n', O_O = ' ', o_o = '&nbsp;';  // just for fun ;)
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
    setInterval(()=>{
        columns.forEach(column => {
            const el = column.chars[~~(Math.random()*column.chars.length)].el;
            el.contains('fadeInOut') ? el.classList.remove('fadeInOut') : el.classList.add('fadeInOut');
        })
    }, 666)
});
