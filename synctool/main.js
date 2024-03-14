const TABLE_SELECTOR = '#root > div > div > div > div > div.container.calendar > div > div:nth-child(2) > div.table-container__body > div > div > div > table > tbody';
const FIRST_COLUMN_TABLE_SELECTOR = '#root > div > div > div > div > div.container.calendar > div > div:nth-child(1) > div > table > tbody';
function fixTable(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    const cells = Array.from(tableEl.querySelectorAll('td'));
    for (const cell of cells) {
        const value = parseInt(cell.textContent);
        if (value.toString().trim() === '0') {
            cell.style.color = 'rgb(204, 204, 204)';
        } else if (Number(value) < 100) {
            //cell.style.color = 'rgb(255, 174, 172)';
        }
    }
    const resultData = rows.map(
        row => Array.from(row.querySelectorAll('td')).map(
            cell => cell.textContent
        )
    );
    return {
        resultEl: tableEl,
        resultData
    };
}

function fixFirstColumn(firstColumnEl, tableEl) {
    const tableRows = Array.from(tableEl.querySelectorAll('tr'));
    const firstColumnRows = Array.from(firstColumnEl.querySelectorAll('tr > *:first-child'));
    tableRows.forEach((row, index) => {
        const rowCells = Array.from(row.querySelectorAll('td'));
        let resentProfit = '0';
        for (let i = rowCells.length - 3; i >= 0; i--) {
            if (rowCells[i].textContent !== '0') {
                resentProfit = rowCells[i].textContent;
                break;
            }
        }
        const totalSpan = document.createElement('span');
        const resentSpan = document.createElement('span');
        const PoPSpan = document.createElement('span');
        const totalAndRecentWrapper = document.createElement('div');
        const chartAndPoPWrapper = document.createElement('div');
        const chartImg = document.createElement('img');
        totalSpan.className = 'total';
        resentSpan.className = 'resent';
        PoPSpan.className = 'PoP';
        totalAndRecentWrapper.className = 'total-and-recent-wrapper';
        chartAndPoPWrapper.className = 'chart-and-pop-wrapper';
        totalSpan.textContent = rowCells[rowCells.length - 2].textContent;
        resentSpan.textContent = resentProfit;
        chartImg.src = "http://placehold.it/40x16";
        let PoP = 0;

        try {
            const total = parseInt(totalSpan.textContent);
            const resent = parseInt(resentSpan.textContent);
            PoP = total != 0 ? (resent / total) * 100 : 0;
        } catch (e) {
            console.error(e);
        }
        PoPSpan.textContent = PoP.toFixed(2) + '%';

        totalAndRecentWrapper.appendChild(totalSpan);
        totalAndRecentWrapper.appendChild(resentSpan);

        chartAndPoPWrapper.appendChild(chartImg);
        chartAndPoPWrapper.appendChild(PoPSpan);


        firstColumnRows[index].appendChild(totalAndRecentWrapper);
        firstColumnRows[index].appendChild(chartAndPoPWrapper);

    });
}

function testFixTable() {
    const tableEl = document.querySelector(TABLE_SELECTOR);
    const {resultEl, resultData} = fixTable(tableEl);
    const rows = resultEl.querySelectorAll('tr');
    console.assert(rows.length === 82, 'There should be 82 rows, but got:', rows.length);
    const cells = resultEl.querySelectorAll('td');
    const grayCells = Array.from(cells).filter(cell => cell.style.color === 'rgb(204, 204, 204)');
    console.assert(
        grayCells.length === 2216,
        'All gray cells should contain 2216 got:',
        grayCells.length
    );
    console.assert((resultData instanceof Array), 'The result data should be an array');
    console.assert((resultData.length === 82), 'The result data length should be 82');
}

function testFixFirstColumn() {
    const tableEl = document.querySelector(TABLE_SELECTOR);

    console.assert(fixFirstColumn instanceof Function, 'Test fixFirstColumn suite');
    const firstColumnEl = document.querySelector(FIRST_COLUMN_TABLE_SELECTOR);
    fixFirstColumn(firstColumnEl, tableEl);
    const rows = firstColumnEl.querySelectorAll('tr');
    console.assert((rows.length === 82), 'The result data length should be 82 got:', rows.length);
    const firstCellEl = firstColumnEl.querySelector('td');
    const firstTotalSpan = firstCellEl.querySelector('span.total');
    console.assert(firstTotalSpan !== null, 'The first cell should contain not empty span element with class "total"');
    console.assert(firstCellEl.textContent === '2011', 'The first cell total sum should be 2011');
}
function setupTests() {
    const originalConsoleAssert = console.assert;
    const assertContainer = document.createElement('div');
    console.assert = function () {
        const el = document.createElement('p');
        setTimeout(() => {
            el.textContent = Array.from(arguments).slice(1).join(' ');
            el.style.color = !arguments[0] ? 'red' : 'green';
            assertContainer.appendChild(el);
        }, 666 * 1.6);
        return originalConsoleAssert.apply(console, arguments);
    }
    document.body.prepend(assertContainer);
}
// setupTests();
setTimeout(() => {
    testFixTable();
    testFixFirstColumn();
}, 666);
