let cart = JSON.parse(localStorage.getItem('cart')) || [];
let uname = localStorage.getItem('uname') || [];
let addedItems = JSON.parse(localStorage.getItem('addedItems')) || {};
let currentPage = 1;
const itemsPerPage = 8;
let currentOrderPage = 1;
const ordersPerPage = 3;
let wheelItems = [];
let spinning = false;

// 获取菜单
async function getMenu(page = 1) {
    try {
        const response = await fetch(`/api/menu?page=${page}&limit=${itemsPerPage}`);
        // console.log(response);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // console.log('Retrieved menu:', data);
        displayMenu(data.items);
        displayPagination(data.currentPage, data.totalPages);
    } catch (error) {
        console.error('获取菜单失败:', error);
    }
}

// 显示菜单
function displayMenu(menu) {
    const menuItems = document.getElementById('menu-items');
    if (!menuItems) return;
    menuItems.innerHTML = '';
    menu.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'menu-item';
        const buttonText = addedItems[item.id] ? '已添加' : '添加到购物车';
        const buttonClass = addedItems[item.id] ? 'add-to-cart-btn added-to-cart selected' : 'add-to-cart-btn';
        const price = parseFloat(item.price);
        const formattedPrice = !isNaN(price) ? price.toFixed(2) : 'N/A';
        itemElement.innerHTML = `
            <img src="${item.image_url}" alt="${item.name}" class="menu-item-image">
            <h3>${item.name}</h3>
            <button onclick="addToCart(${item.id}, '${item.name}', ${price}, this)" class="${buttonClass}">${buttonText}</button>
        `;
        menuItems.appendChild(itemElement);
    });
}

// 显示分页控件
function displayPagination(currentPage, totalPages) {
    const paginationElement = document.getElementById('pagination');
    if (!paginationElement) return;

    let paginationHTML = '';
    const maxVisiblePages = 5;
    const halfVisible = Math.floor(maxVisiblePages / 2);

    // 添加"上一页"按钮
    paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>`;

    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        paginationHTML += `<button onclick="changePage(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span>...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `<button onclick="changePage(${i})" ${i === currentPage ? 'class="active"' : ''}>${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span>...</span>`;
        }
        paginationHTML += `<button onclick="changePage(${totalPages})">${totalPages}</button>`;
    }

    // 添加"下一页"按钮
    paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;

    paginationElement.innerHTML = paginationHTML;
}

// 修改切换页面函数
function changePage(page) {
    currentPage = page;
    getMenu(page);
    // 添加滚动到顶部的代码
    window.scrollTo({
        top: 0,
        behavior: 'auto'
    });
}

// 添加到购物车或从购物车中移除
async function addToCart(itemId, name, price, button) {
    try {
        // console.log(`Attempting to add item: ID=${itemId}, Name=${name}, Price=${price}`);
        // 从服务器获取最新的菜品信息
        const response = await fetch(`/api/refresh-menu-item/${itemId}`);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`菜品未找到: ID=${itemId}, Name=${name}`);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const freshItem = await response.json();
        // console.log('Fresh item data:', freshItem);

        // 使用最新的价格信息
        price = parseFloat(freshItem.price);

        if (isNaN(price) || price < 0) {
            console.error(`Invalid price for item ${name}: ${price}`);
            showModal(`无法添加商品 ${name}：价格无效`, 'error');
            return;
        }

        // 检查购物车数组是否已经初始化
        if (typeof cart === 'undefined') {
            cart = [];
        }

        // 检查 addedItems 对象是否已经初始化
        if (typeof addedItems === 'undefined') {
            addedItems = {};
        }

        const existingItemIndex = cart.findIndex(item => item.id === itemId);
        if (existingItemIndex !== -1) {
            // 如果商品已在购物车中，则增加数量
            cart[existingItemIndex].quantity += 1;
        } else {
            // 如果商品不在购物车中，则添加它
            cart.push({ id: itemId, name: freshItem.name, price, quantity: 1, uname });
            addedItems[itemId] = true;
        }

        // 更新 localStorage
        localStorage.setItem('cart', JSON.stringify(cart));
        localStorage.setItem('addedItems', JSON.stringify(addedItems));

        // console.log(`添加到购物车: ${freshItem.name}, 价格: ${price}`);

        // 如果在购物车页面，更新显示（可选）
        if (window.location.pathname.includes('cart.html')) {
            displayCart();
        }

        // 更新按钮状态
        updateButtonState(button, true);

        // 显示成功消息
        showModal(`${freshItem.name} 已添加到购物车`, 'success');
        // wheelshowcart()
    } catch (error) {
        console.error('添加到购物车失败:', error);
        showModal(`添加商品失败: ${error.message}`, 'error');
    }
}

// 更新按钮状态的辅助函数
function updateButtonState(button, added) {
    if (button) {
        button.textContent = added ? '已添加' : '添加到购物车';
        button.classList.toggle('added-to-cart', added);
        button.classList.toggle('selected', added);
    }
}

// 显示购物车
function displayCart() {
    const cartItems = document.getElementById('cart-items');
    if (!cartItems) return;
    cartItems.innerHTML = '';
    cart.forEach(item => {
        const itemElement = document.createElement('li');
        // itemElement.innerHTML = `
        //     ${item.name} - 数量: ${item.quantity}
        //     <button onclick="removeFromCart(${item.id})">删除</button>
        // `;
        itemElement.innerHTML = `
            ${item.name}
            <button onclick="removeFromCart(${item.id})">删除</button>
        `;
        cartItems.appendChild(itemElement);
    });

    const totalPrice = cart.reduce((total, item) => total + item.price * item.quantity, 0);
    const totalElement = document.createElement('p');
    cartItems.appendChild(totalElement);
}

// 从购物车中删除
function removeFromCart(itemId) {
    const index = cart.findIndex(item => item.id === itemId);
    if (index !== -1) {
        cart.splice(index, 1);
        delete addedItems[itemId];
        localStorage.setItem('cart', JSON.stringify(cart));
        localStorage.setItem('addedItems', JSON.stringify(addedItems));
        displayCart();

        // 如果在菜单页面，更新按钮状态
        const button = document.querySelector(`button[onclick*="addToCart(${itemId},"]`);
        if (button) {
            button.textContent = '添加到购物车';
            button.classList.remove('added-to-cart');
            button.classList.remove('selected'); // 移除选中状态的类
        }
    }
}

// 提交订单
async function submitOrder() {
    if (cart.length === 0) {
        alert('购物车为空，无法提交订单');
        return;
    }

    const submitButton = document.getElementById('submit-order');
    submitButton.disabled = true;
    submitButton.textContent = '提交中...';

    try {
        // console.log('Original cart:', JSON.stringify(cart, null, 2));

        // 确保购物车中的数据都是有效的
        const validCart = cart.filter(item => {
            const price = parseFloat(item.price);
            const quantity = parseInt(item.quantity);
            if (isNaN(price) || isNaN(quantity) || price < 0 || quantity <= 0) {
                console.error(`Invalid item in cart: ${JSON.stringify(item)}`);
                return false;
            }
            return true;
        }).map(item => ({
            id: parseInt(item.id),
            uname: item.uname,
            name: item.name,
            price: parseFloat(item.price),
            quantity: parseInt(item.quantity)
        }));

        if (validCart.length === 0) {
            throw new Error('购物车中没有有效的商品');
        }

        // console.log('Sending to server:', JSON.stringify(validCart, null, 2));

        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCart),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`服务器错误: ${errorData.error || response.statusText}`);
        }
        const result = await response.json();

        // 显示成功消息
        showModal('订单提交成功！');

        clearCart(); // 清空购物车

        // 恢复提交按钮状态
        submitButton.disabled = false;
        submitButton.textContent = '提交订单';

        // 更新购物车显示
        displayCart();
    } catch (error) {
        console.error('提交订单失败:', error);
        showModal(`提交订单失败: ${error.message}`, 'error');
        submitButton.disabled = false;
        submitButton.textContent = '提交订单';
    }
}

// 显示模态弹窗
function showModal(message, type = 'success') {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content ${type}">
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(modal);

    // 添加类以触发动画
    setTimeout(() => modal.classList.add('show'), 10);

    // 1秒后关闭模态框
    setTimeout(() => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300); // 等待动画完成后移除元素
    }, 1000);
}

// 清空购物车
function clearCart() {
    cart = [];
    addedItems = {};
    localStorage.removeItem('cart');
    localStorage.removeItem('addedItems');
    displayCart();

    // 恢复所有"已添加"按钮的状态
    const addedButtons = document.querySelectorAll('.added-to-cart');
    addedButtons.forEach(button => {
        button.textContent = '添加到购物车';
        button.classList.remove('added-to-cart');
        button.classList.remove('selected'); // 移除选中状态的类
    });
}

// 获取历史订单
async function getOrders(page = 1) {
    try {
        const response = await fetch(`/api/orders?page=${page}&limit=${ordersPerPage}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        displayOrders(data.orders);
        displayOrdersPagination(data.currentPage, data.totalPages);
    } catch (error) {
        console.error('获取历史订单失败:', error);
    }
}

// 显示历史订单
function displayOrders(orders) {
    const orderHistory = document.getElementById('order-history');
    if (!orderHistory) return;
    orderHistory.innerHTML = '';
    orders.forEach(order => {
        const orderElement = document.createElement('div');
        orderElement.className = 'order';
        let itemsHtml = order.items.map(item =>
            `<li>${item.name}</li>`
        ).join('');
        // console.log(itemsHtml)
        orderElement.innerHTML = `
            <div class="order-header">
                <h3>订单 #${order.id}</h3>
                <p class="order-date">${new Date(order.order_date).toLocaleString()}</p>
            </div>
            <ul>${itemsHtml}</ul>
        `;
        orderHistory.appendChild(orderElement);
    });
}

// 显示订单分页控件
function displayOrdersPagination(currentPage, totalPages) {
    const paginationElement = document.getElementById('orders-pagination');
    if (!paginationElement) return;

    let paginationHTML = '';
    const maxVisiblePages = 3;
    const halfVisible = Math.floor(maxVisiblePages / 2);

    // 添加"上一页"按钮
    paginationHTML += `<button onclick="changeOrderPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>`;

    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        paginationHTML += `<button onclick="changeOrderPage(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span>...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `<button onclick="changeOrderPage(${i})" ${i === currentPage ? 'class="active"' : ''}>${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span>...</span>`;
        }
        paginationHTML += `<button onclick="changeOrderPage(${totalPages})">${totalPages}</button>`;
    }

    // 添加"下一页"按钮
    paginationHTML += `<button onclick="changeOrderPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;

    paginationElement.innerHTML = paginationHTML;
}

// 修改切换订单页面函数
function changeOrderPage(page) {
    currentOrderPage = page;
    getOrders(page);
    // 添加滚动到顶部的代码
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// 清除菜单选择和购物车
function clearMenuSelection() {
    cart = [];
    addedItems = {};
    localStorage.removeItem('cart');
    localStorage.removeItem('addedItems');

    // 如果在菜单页面，更新所有按钮状态
    const addedButtons = document.querySelectorAll('.added-to-cart');
    addedButtons.forEach(button => {
        button.textContent = '添加到购物车';
        button.classList.remove('added-to-cart');
        button.classList.remove('selected'); // 移除选中状态的类
    });
}

// 初始化移动端菜单
function initMobileMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const mainNav = document.getElementById('main-nav');

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', function () {
            mainNav.classList.toggle('show');
        });
    }
}

//登录验证
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html'; // 如果没有 token，重定向到登录页面
    }
}

// 在 init 函数中调用 checkAuth
function init() {
    checkAuth(); // 检查用户是否已登录
    console.log('开始初始化');
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    initMobileMenu();


    if (currentPath === 'index.html' || currentPath === '') {
        getMenu(currentPage);
    } else if (currentPath === 'cart.html') {
        displayCart();
        const submitOrderButton = document.getElementById('submit-order');
        if (submitOrderButton) {
            submitOrderButton.addEventListener('click', submitOrder);
        }
    } else if (currentPath === 'orders.html') {
        getOrders(currentOrderPage);
    } else if (currentPath === 'wheel.html') {
        initWheel();
        const spinButton = document.getElementById('spin-button');
        if (spinButton) {
            spinButton.addEventListener('click', spinWheel);
        }
    }

    const logout_Button = document.getElementById('logout-button');
    // console.log(logout_Button);

    if (logout_Button) {
        logout_Button.addEventListener('click', function () {
            localStorage.removeItem('token'); // 清除 JWT
            localStorage.removeItem('cart'); //
            localStorage.removeItem('uname'); //
            window.location.href = 'login.html'; // 重定向到登录页面
        });
    }
}

async function initWheel() {
    try {
        const response = await fetch('/api/all-menu-items');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        wheelItems = await response.json();
        // console.log(wheelItems);
        drawWheel();
        // wheelshowcart()
    } catch (error) {
        console.error('获取菜品失败:', error);
    }
}

function drawWheel() {
    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;

    ctx.clearRect(0, 0, width, height);

    const sliceAngle = (2 * Math.PI) / wheelItems.length;

    for (let i = 0; i < wheelItems.length; i++) {
        const startAngle = (i * sliceAngle) - (Math.PI / 2); // 从12点钟方向开始
        const endAngle = ((i + 1) * sliceAngle) - (Math.PI / 2);

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = `hsl(${(i * 360) / wheelItems.length}, 70%, 60%)`;
        ctx.fill();

        // 调整文字位置
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + sliceAngle / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(wheelItems[i].name, radius - 30, 5);
        ctx.restore();
    }

    drawCenterPoint(ctx, centerX, centerY);
}

function drawCenterPoint(ctx, centerX, centerY) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();
}

function spinWheel() {
    if (spinning) return;
    spinning = true;

    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    let currentRotation = 0;
    const totalRotation = Math.random() * 360 + 1440; // At least 4 full rotations
    const duration = 5000; // 5 seconds
    const start = performance.now();

    function animate(time) {
        const elapsed = time - start;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4); // Ease out quartic

        currentRotation = easeProgress * totalRotation;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制旋转的转盘
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((currentRotation * Math.PI) / 180);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        drawWheel();
        ctx.restore();

        // 绘制固定的指针
        drawPointer(ctx, canvas.width / 2, canvas.height / 2);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            spinning = false;
            // 修正选中菜品的计算
            const normalizedRotation = (currentRotation % 360 + 360) % 360; // 确保结果为正
            const selectedIndex = wheelItems.length - 1 - Math.floor(normalizedRotation / (360 / wheelItems.length));
            const selectedDish = wheelItems[selectedIndex];

            // 显示弹窗
            showConfirmDialog(selectedDish);
        }
    }

    requestAnimationFrame(animate);
}

function showConfirmDialog(dish) {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
        <p>已选中: ${dish.name},</p>
        <p>是否加入购物车？</p>
        <button id="confirm-yes">是</button>
        <button id="confirm-no">否</button>
    `;
    document.body.appendChild(dialog);

    document.getElementById('confirm-yes').addEventListener('click', async () => {
        await addToCart(dish.id, dish.name, dish.price);
        closeDialog(dialog);
        wheelshowcart()
    });

    document.getElementById('confirm-no').addEventListener('click', () => {
        closeDialog(dialog);
    });
}

function closeDialog(dialog) {
    document.body.removeChild(dialog);
}

// 新增函数：绘制指针
function drawPointer(ctx, centerX, centerY) {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 60);  // 增加指针长度
    ctx.lineTo(centerX - 8, centerY - 10);  // 减小指针宽度
    ctx.lineTo(centerX + 8, centerY - 10);  // 减小指针宽度
    ctx.closePath();
    ctx.fillStyle = 'black';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;  // 减小边框宽度
    ctx.stroke();
}

function wheelshowcart() {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    if (cart) {
        let names = cart.map(names => {
            return names['name']
        })
        names = names.join('\n')
        const wsc = document.getElementById('selected-dish')
        wsc.innerText = `${names}`
        // console.log(names);

    }
}

// 添加一个页面加载完成后的事件监听器
window.addEventListener('load', () => {
    // 检查是否是页面刷新
    if (performance.navigation.type === 1) {
        console.log('页面被刷新');
        clearCart(); // 只在页面刷新时清空购物车
    }
});

// 等待 DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}



