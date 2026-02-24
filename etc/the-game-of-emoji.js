/**
  The game of emoji concept.

  The Great Order Of Moor-Neighborhood Items:
  
    ┌───────────┐
    │           │
    │           │
    │   ┌───┐   │
    │   │701│   │
    │   │682│   │
    │   │543│   │
    │   └───┘   │
    │           │
    │           │
    └───────────┘
  In other words:
  [top, right-top, right, bottom-right, bottom, bottom-left, left, top-left, self]
  @note: self (the last item of the array) could be not presented, so should be checked before access.

*/
class ItemType {
    constructor(options, itemType) {
        this.produce = options.produce;        
        this.type = itemType;
        this.food = options.food || [];
        this.deadType = options.deadType;
        this.movable = options.movable;
    }
}
class Item {
    health = 50
    constructor(itemType, point, index) {
        this.itemType = itemType;
        this.type = itemType.type;
        this.x = point.x;
        this.y = point.y;
        this.index = index;
    }
    die() {
        this.type = this.itemType.deadType
        this.itemType = itemTypes[this.type];
    }
}

const ITEM_TYPES = {
    ' ': {
        produce: {
            // Perpetum-nobel
            '💩': [[' ', ' ', ' ', ' ', ' ', ' ', '💩']]
        },
        deadType: ' ', // see recursion
    },
    '💩': {
        produce: {
            // The bricks of life
            '🚶‍♀️' : [[' ', '💩', '💩', '💩', ' ', '💩', '💩', '💩']],                            
            '🐛': [['💩', ' ', '💩', ' ', '💩', ' ', '💩', ' ']],                            
            '🌳' : [[' ', '💩', ' ', '💩', ' ', '💩', ' ', '💩']],                            
            ' ' : [
                ['💩', '💩', '💩', '💩', '💩', '💩', '💩', '💩'],                            
                ['🐛', '🐛', '🐛', '🐛', '🐛', '🐛', '🐛', '🐛'],
                ['🐛', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', '🐛 ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', '🐛 ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', '🐛 ', ' ', ' ', ' ', ' '],
            ],
            '🐄' : [[' ', ' ', '💩', ' ', ' ', ' ', '💩', ' ']],                            
        },
        deadType: ' ', // no loops!
    },
    '🐛': {
        produce: {
            '🚶‍♀️' :[[' ', '💩', '💩', '💩', ' ', '💩', '💩', '💩']],                            
            '🐛': [['💩', ' ', '💩', ' ', '💩', ' ', '💩', ' ']],                            
            ' ' : [['💩', '💩', '💩', '💩', '💩', '💩', '💩', '💩']],                            
            '🐄' : [[' ', ' ', '💩', ' ', ' ', ' ', '💩', ' ']],                            
        },        
        deadType: '💩',
        food: ['💩'],
        movable: true,
    },
    '🐄': {
        produce: {
            ' ' : [['💩', '💩', '💩', '💩', '💩', '💩', '💩', '💩']],                            
        },        
        deadType: '💩',
        food: ['🌳'],
        movable: true,
    },
    '🚶‍♀️': {
        produce: {
            '💩' : [['💩', '💩', '💩', '💩', '💩', '💩', '💩', '💩']],                            
        },                
        deadType: '💩',
        food: ['🐄'],
        movable: true,
    },
    '🌳': {
        produce: {
            ' ' : [['💩', '💩', '💩', '💩', '💩', '💩', '💩', '💩']],                            
        },                
        deadType: '💩',
    }

};
const ITEM_TYPES_LIST = Object.keys(ITEM_TYPES);
const randomizeItemType = () => ITEM_TYPES_LIST[Math.floor(Math.random() * ITEM_TYPES_LIST.length)]; 
const itemTypes = ITEM_TYPES_LIST.map(itemType => new ItemType(ITEM_TYPES[itemType], itemType)).reduce((a, c) => { a[c.type] = c; return a; }, {});

const rootEl = document.getElementsByTagName('main')[0];
class App {
    items = []
    width = 16
    height = 13
    constructor(rootEl) {
        this.rootEl = rootEl;
        const rootRect = document.body.getBoundingClientRect();
        if (rootRect.height > rootRect.width) {
            const width = this.width;
            this.height = this.width;
            this.width = this.height;
        }
        this.items = Array(this.width * this.height).fill(' ').map(randomizeItemType).map((type, index) => new Item(itemTypes[type], this.indexToPoint(index), index));
        this.rootEl.style.gridTemplateRows = `repeat(${this.width}, 3.333rem)`;
        this.rootEl.style.gridTemplateColumns = `repeat(${this.height}, 3.333rem)`;
    }
    indexToPoint(index) {
        const y = index === 0 ? 0 : Math.floor(index / this.width)
        const x = index - this.width * y;
        return { x, y };
    }
    pointToIndex(pointOrItem) {
        return pointOrItem.y * this.width + pointOrItem.x;
    }
    step() {
        let prevItems = JSON.parse(JSON.stringify(this.items));        
        // calculate deaths from starving, and feed for food
        prevItems.forEach(item => {
            if (item.itemType !== itemTypes[item.type]) {
                item.itemType = itemTypes[item.type];
            } 

            const newItem = this.items[item.index]; 
            item.health -= 1;
            if (item.health === 0) {
                newItem.health = 100;
                newItem.type = item.itemType.deadType;
                newItem.itemType = itemTypes[newItem.type];
            }
            if (item.itemType.food && item.itemType.food.length) {
                const neighbors = this.getNeighbors(prevItems, item).filter(n => !!n);
                if (item.itemType.food.some(food => neighbors.some(n => n.type === food))) {
                    newItem.health += 10;
                    if (newItem.health >= 50) {
                        newItem.health -= 42;
                    }
                }    
            }
        });
        prevItems = JSON.parse(JSON.stringify(this.items));
        // calculate producesrs
        prevItems.forEach(item => {
            if (item.itemType !== itemTypes[item.type]) {
                item.itemType = itemTypes[item.type];
            } 
            Object.keys(item.itemType.produce).some(producer => {
               const producers = item.itemType.produce[producer];
               const ns = this.getNeighbors(prevItems, item); //.map(n => n ? n : { type: ' ',  itemType: itemTypes[' ']});
               if (ns.length === 8) {
                   if (producers.some(prds => {
                        if (prds.every((p, i) => {
                            return ns[i] ? p === ns[i].type : false;
                        })) {
                            return true;
                        }    
                   })) {
                       if (item.type !== producer) {
                            const newItem = this.items[item.index]; 
                            console.log(`A ${producer} was born!`);
                            newItem.type = producer;    
                            newItem.itemType = itemTypes[newItem.type]; // !!!IMPORTANT!!!
                            return true;
                       }
                   }
               }
            });
        })
        prevItems = JSON.parse(JSON.stringify(this.items));
        // calculate moveable objects (🐄, 🐛, 🚶‍♀️)
        prevItems.forEach(item => {
            if (item.itemType !== itemTypes[item.type]) {
                item.itemType = itemTypes[item.type];
            } 
            if (item.itemType.movable) {
                const ns = this.getNeighbors(prevItems, item);
                const freeItem = ns.find(n => n && n.type === ' ');
                if (freeItem) {
                    this.items[freeItem.index].type = item.type;
                    this.items[freeItem.index].itemType = itemTypes[item.type];
                    this.items[item.index].type = ' ';
                    this.items[item.index].itemType = itemTypes[' '];
                    console.log(item.type, 'moved!');
                }
            } 
        })
    }
    getNeighbors(items, item) {
        return [
            this.getItemReletiveTo(items, item,  0, -1), // top
            this.getItemReletiveTo(items, item,  1, -1), // top-right
            this.getItemReletiveTo(items, item,  1,  0), // right
            this.getItemReletiveTo(items, item,  1,  1), // bottom-right
            this.getItemReletiveTo(items, item,  0,  1), // bottom
            this.getItemReletiveTo(items, item, -1,  1), // bottom-left
            this.getItemReletiveTo(items, item, -1,  0), // left
            this.getItemReletiveTo(items, item, -1, -1), // top-left

        ];
    }
    getItemReletiveTo(items, item, offsetX, offsetY) {
        let x = item.x + offsetX;
        let y = item.y + offsetY;

        if ((x < 0) || (x >= this.width)) {
            if (x < 0) x = this.width + x; else x = x - this.width - 1;
        }
        if ((y < 0) || (y >= this.height)) {
            if (y < 0) y = this.height + y; else y = y - this.height - 1;
        }
        const index = this.pointToIndex({
           x: Math.abs(x), y: Math.abs(y)
        });
        if (!items[index]) {
            console.log('wtf?', x, y, offsetX, offsetY, item);
        }
        return items[index];
    }
    render() {        
        const renderItem = item => `<span data-x="${item.x}" data-y="${item.y}" data-item-index="${item.index}" style="color: rgba(0,0,0,${item.health * 0.01 + 0.5})">${item.type}</span>`;        
        const html = this.items.map(renderItem).join('\n\t\t\t\t');
        this.rootEl.innerHTML = html; // React for lazy peapole (:
    }
    playing = false
    interval = 0
    togglePlay() {
        this.playing = !this.playing;
        console.log('is playing:', this.playing);
        clearInterval(this.interval);
        if (this.playing) {
            this.interval = setInterval(() => {
                this.step();
                this.render();
            }, 0);
        } 
    }
    randomize() {
        this.items.forEach(item => {
            item.type = randomizeItemType()
            item.itemType = itemTypes[item.type];
        });
    }
}
const app = new App(rootEl);
app.render();
document.body.addEventListener('keypress', e => {
    switch(e.key) {
        case 's': case 'S': app.step(); app.render(); break;
        case 'p': case 'P': case ' ': app.togglePlay(); break;
        case 'r': case 'R': app.randomize(); break;
    }
})