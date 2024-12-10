// 声明 WebSocket 变量
// import pool from "express";

let ws;
// 修改筛选相关变量
let currentFilters = {
    initiator: 'all',
    status: 'all',
    dateRange: 'all',
    startDate: null,
    endDate: null,
    statsUser: 'all'  // 添加统计用户筛选
};
// 声明图表变量
// let popularDishesChart = null;
// 添加声音提示功能
let audioContext = null;
let audioInitialized = false;
// 声音设置
let soundEnabled = true;

document.addEventListener('DOMContentLoaded', async () => {
    initAudioContext();
    // initWebSocket();
    await getUsers();
    await initFilters();

    // 默认显示菜品管理部分
    showSection('dishes');

    // 导航点击事件
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);

            // 更新导航状态
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });

    const modal = document.getElementById('dish-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideDishForm();
            }
        });
    }
    // 添加订单模态框的点击关闭功能
    const orderModal = document.getElementById('order-modal');
    if (orderModal) {
        orderModal.addEventListener('click', (e) => {
            if (e.target === orderModal) {
                hideOrderModal();
            }
        });
    }

    // 加载初始数据
    await loadDishes();
    await loadOrders(); // 加载订单


    // 初始化声音设置
    const savedSoundSetting = localStorage.getItem('soundEnabled');
    if (savedSoundSetting !== null) {
        soundEnabled = savedSoundSetting === 'true';
        const button = document.getElementById('toggle-sound');
        button.classList.toggle('sound-muted', !soundEnabled);
        button.querySelector('.sound-icon').textContent = soundEnabled ? '🔔' : '🔕';
    }

    // 添加声音切换按钮事件监听
    document.getElementById('toggle-sound').addEventListener('click', toggleSound);

    // 初始化 WebSocket 连接
    initWebSocket();

    // 添加统计时间范围切换事件
    const statsPeriod = document.getElementById('stats-period');
    if (statsPeriod) {
        await loadStats();
        statsPeriod.addEventListener('onchange', () => {
            loadStats();
        });
    }
    // 初始加载统计数据

    // 添加移动端支持
    if ('ontouchstart' in window) {
        initTouchSupport();
    }
});


// 显示指定部分
function showSection(sectionId) {
    // 隐藏所有部分
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });

    // 显示选中的部分
    const selectedSection = document.getElementById(`${sectionId}-section`);
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }
}

// 修改 WebSocket 连接初始化
function initWebSocket() {
    // 确保之前的连接已关闭
    if (ws) {
        ws.close();
    }

    // 创建新的 WebSocket 连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    // console.log('Connecting to WebSocket:', wsUrl);

    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
        // console.log('WebSocket 连接已建立');
    };

    ws.onmessage = async function (event) {
        // console.log('收到WebSocket消息:', event.data);
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'new_order') {
                // 显示通知并播放提示音
                showNotification('收到新订单！');
                playNotificationSound();

                // 如果当前在订单页面，自动刷新订单列表
                if (document.getElementById('orders-section').style.display !== 'none') {
                    await loadOrders();
                }
            }
        } catch (error) {
            console.error('处理WebSocket消息失败:', error);
        }
    };

    ws.onclose = function () {
        console.log('WebSocket连接已关闭，尝试重新连接...');
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = function (error) {
        console.error('WebSocket错误:', error);
    };
}

// 添加关闭通知的函数
function dismissNotification() {
    const notification = document.getElementById('notification');
    notification.classList.remove('show');
    setTimeout(() => {
        notification.style.display = 'none';
    }, 300);
}

// 修改显示通知的函数，添加自动关闭和手动关闭功能
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <p>${message}</p>
        <button onclick="dismissNotification()" class="notification-close">知道了</button>
    `;
    notification.style.display = 'block';
    notification.classList.add('show');

    // 5秒后自动隐藏
    const autoHideTimeout = setTimeout(() => {
        dismissNotification();
    }, 5000);

    // 如果用户手动关闭，清除自动隐藏的计时器
    notification.querySelector('button').addEventListener('click', () => {
        clearTimeout(autoHideTimeout);
    });
}

// document.querySelectorAll('.nav-link').forEach(link => {
//     link.addEventListener('click', function (e) {
//         e.preventDefault();
//         const section = this.dataset.section;
//         showSection(section);
//
//         // 更新导航状态
//         document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
//         this.classList.add('active');
//     });
// });

// 图片预览功能
document.getElementById('dish-image').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('dish-image-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
});

// 初始化筛选器
async function initFilters() {
    const dateRangeSelect = document.getElementById('date-range');
    const customDateRange = document.querySelector('.custom-date-range');
    const statsUserFilter = document.getElementById('stats-user-filter');
    const orderinitiatorfilter = document.getElementById('order-initiator-filter')

    // 初始化统计用户筛选
    if (statsUserFilter && orderinitiatorfilter) {
        const str = await getUsers()
        statsUserFilter.innerHTML = '<option value="all">所有用户</option>' + str
        orderinitiatorfilter.innerHTML = `<option value="all">全部</option>` + str
    }

    // 日期范围选择事件
    dateRangeSelect.addEventListener('change', function () {
        if (this.value === 'custom') {
            customDateRange.style.display = 'flex';
        } else {
            customDateRange.style.display = 'none';
            // 自动设置对应的日期范围
            setDateRange(this.value);
        }
    });

    // 初始化日期范围为全部时间
    setDateRange('all');
}

// 修改设置日期范围函数添加 'all' 的处理
function setDateRange(range) {
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (range) {
        case 'all':
            // 不设置具体日期范围
            document.getElementById('start-date').value = '';
            document.getElementById('end-date').value = '';
            return;
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'week':
            startDate.setDate(today.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'month':
            startDate.setDate(today.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'custom':
            return; // 不设置日期，使用用户输入
    }

    document.getElementById('start-date').value = formatDate(startDate);
    document.getElementById('end-date').value = formatDate(endDate);
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

async function getUsers() {
    const response = await fetch('api/admin/getAllUsers');
    const users = await response.json()

    const str = users.map(user => {
        return `<option value="${user.username}">${user.username}</option>`
    }
    ).join('');
    // console.log(str);
    return str
}
// getUsers();

// 改应用筛选函数
async function applyFilters() {
    const initiator = document.getElementById('order-initiator-filter').value;
    const status = document.getElementById('order-status-filter').value;
    const dateRange = document.getElementById('date-range').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    currentFilters = {
        initiator,
        status,
        dateRange,
        startDate,
        endDate
    };

    await loadOrders();
}

// 修改重置筛选函数
function resetFilters() {
    document.getElementById('order-status-filter').value = 'all';
    document.getElementById('order-initiator-filter').value = 'all';
    document.getElementById('date-range').value = 'all';
    setDateRange('all');
    document.querySelector('.custom-date-range').style.display = 'none';

    currentFilters = {
        status: 'all',
        initiator: 'all',
        dateRange: 'all',
        startDate: null,
        endDate: null
    };

    loadOrders();
}

// 修改加载订单列表函数
async function loadOrders() {
    try {
        // 获取筛选条件
        const status = document.getElementById('order-status-filter').value;
        const initiator = document.getElementById('order-initiator-filter').value;
        const dateRange = document.getElementById('date-range').value;
        let startDate = document.getElementById('start-date').value;
        let endDate = document.getElementById('end-date').value;

        // 构建查询参数
        const params = new URLSearchParams();
        if (status !== 'all') params.append('status', status);
        if (initiator !== 'all') params.append('initiator', initiator);
        if (dateRange !== 'all' && dateRange !== 'custom') {
            const dates = getDateRange(dateRange);
            startDate = dates.startDate;
            endDate = dates.endDate;
        }
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const response = await fetch(`/api/admin/orders?${params.toString()}`);
        const data = await response.json();

        // 更新用户筛选器选项
        updateOrderUserOptions(data.initiators);

        // 渲染订单列表
        renderOrderList(data.orders);

        // 检查是否有完成的新订单
        const newOrders = data.orders.filter(order => order.status !== 'completed');
        if (newOrders.length > 0) {
            showNotification(`您有 ${newOrders.length} 个未完成的订单！`);
            playNotificationSound();
        }

    } catch (error) {
        console.error('加载订单列表失败:', error);
        showNotification('加载订单列表失败', 'error');
    }
}

// 更新订单用户筛选器选项
function updateOrderUserOptions(initiators) {
    const select = document.getElementById('order-initiator-filter');
    const currentValue = select.value;

    // 保存当前选中的值
    const selectedValue = select.value;

    // 清空现有选项（除了"全部用户"）
    while (select.options.length > 1) {
        select.remove(1);
    }

    // 添加用户选项
    if (Array.isArray(initiators)) {
        initiators.forEach(initiator => {
            const option = new Option(initiator, initiator);
            select.add(option);
        });

        // 如果之前选中的值仍然存在，则恢复选中状态
        if (selectedValue && initiators.includes(selectedValue)) {
            select.value = selectedValue;
        }
    }
}

// 获取日期范围
function getDateRange(range) {
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (range) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'week':
            startDate.setDate(today.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'month':
            startDate.setMonth(today.getMonth() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
    }

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

// 更新订单状态
async function updateOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '更新状态失败');
        }

        // 更新成功后刷新订单列表
        await loadOrders();

        // 显示成功提示
        // showNotification('订单状态已更新');
        console.log('订单状态已更新');

    } catch (error) {
        console.error('更新订单状态失败:', error);
        showNotification('更新订单状态失败: ' + error.message, 'error');
    }
}

// 显示订单详情
async function showOrderDetails(orderId) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}`);
        const order = await response.json();

        const orderDetails = document.getElementById('order-details');
        orderDetails.innerHTML = `
            <div class="order-detail-header">
                <h4>订单号: ${order.id}</h4>
                <p>下单时间: ${new Date(order.order_date).toLocaleString()}</p>
                <p>发起人: ${order.initiator || '未知'}</p>
            </div>
            <div class="order-detail-info">
                <p>状态: ${getStatusText(order.status)}</p>
            </div>
            <div class="order-detail-items">
                <h5>订单内容:</h5>
                <div class="order-items-list">
                    ${order.items.map(item => `
                        <div class="order-item-detail">
                            <span class="item-name">${item.name}</span>
                            <span class="item-quantity">x${item.quantity}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // 显示模态框
        const modal = document.getElementById('order-modal');
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('show'), 10);
    } catch (error) {
        console.error('获取订单详情失败:', error);
        showNotification('获取订单详情失败', 'error');
    }
}

// 加载统计数据
async function loadStats() {
    try {
        const period = document.getElementById('stats-period').value;
        const initiator = document.getElementById('stats-user').value;

        const response = await fetch(`/api/admin/stats?period=${period}&initiator=${initiator}`);
        const stats = await response.json();

        // 更新用户选择器选项
        updateInitiatorOptions(stats.initiators);

        // 更新统计数据显示
        updateStatsDisplay(stats);

    } catch (error) {
        console.error('加载统计数据失败:', error);
        showNotification('加载统计数据失败', 'error');
    }
}

// 更新发起人选择器选项
function updateInitiatorOptions(initiators) {
    const select = document.getElementById('stats-user');
    const currentValue = select.value;

    // 保存当前选中的值
    const selectedValue = select.value;

    // 清空现有选项（除了"全部用户"）
    while (select.options.length > 1) {
        select.remove(1);
    }

    // 添加发起人选项
    initiators.forEach(initiator => {
        const option = new Option(initiator, initiator);
        select.add(option);
    });

    // 如果之前选中的值仍然存在，恢复选中状态
    if (selectedValue && initiators.includes(selectedValue)) {
        select.value = selectedValue;
    }
}

// 更新统计数据显示
function updateStatsDisplay(stats) {
    const revenueStats = document.getElementById('revenue-stats');

    // 格式化日期显示
    const formatDate = (dateStr) => {
        if (!dateStr) return '无数据';
        return new Date(dateStr).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    };

    revenueStats.innerHTML = `
        <div class="stats-item">
            <span class="stats-label">订单总数</span>
            <span class="stats-value">${stats.orderCount}单</span>
        </div>
        <div class="stats-item">
            <span class="stats-label">下单天数</span>
            <span class="stats-value">${stats.activeDays}天</span>
        </div>
        <div class="stats-item">
            <span class="stats-label">统计时间</span>
            <span class="stats-value">${formatDate(stats.firstOrderDate)} ~ ${formatDate(stats.lastOrderDate)}</span>
        </div>
    `;

    // 更新热销排行图表
    updatePopularDishesChart(stats.popularDishes);
}

// 更新热销排行图表
function updatePopularDishesChart(popularDishes) {
    const ctx = document.getElementById('popular-dishes-chart').getContext('2d');

    // 如果已存在图表，先销毁它
    if (window.popularDishesChart) {
        window.popularDishesChart.destroy();
    }

    // 准备图表数据
    const labels = popularDishes.map(dish => dish.name);
    const quantities = popularDishes.map(dish => dish.totalQuantity);

    // 创建新图表
    window.popularDishesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '销售数量',
                    data: quantities,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '数量'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: '热销统计'
                }
            }
        }
    });
}

// 辅助数
function getStatusText(status) {
    const statusMap = {
        'pending': '待处理',
        'processing': '处理中',
        'completed': '已完成'
    };
    return statusMap[status] || status;
}

// 加载菜品列表
async function loadDishes() {
    try {
        const response = await fetch('/api/admin/dishes');
        const dishes = await response.json();

        const container = document.getElementById('dishes-list');
        container.innerHTML = dishes.map(dish => `
            <div class="dish-card">
                <img src="${dish.image_url || '/images/default-dish.jpg'}" alt="${dish.name}" class="dish-image">
                <div class="dish-info">
                    <h3>${dish.name}</h3>
                </div>
                <div class="dish-actions">
                    <button onclick="editDish(${dish.id})" class="btn btn-edit">编辑</button>
                    <button onclick="deleteDish(${dish.id})" class="btn btn-delete">删除</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载菜品失败:', error);
    }
}

// 显示模态框
function showModal(modal) {
    if (modal) {
        modal.style.display = 'flex';
        // 触发重排以启动过渡动画
        modal.offsetHeight;
        modal.classList.add('show');
    }
}

// 隐藏模态框
function hideModal(modal) {
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300); // 等待过渡动画完成
    }
}

// 修改 showDishForm
function showDishForm(dish = null) {
    const modal = document.getElementById('dish-modal');
    const form = document.getElementById('dish-form');
    const preview = document.getElementById('dish-image-preview');

    if (!modal || !form) {
        console.error('Modal or form elements not found');
        return;
    }

    // 重置表单
    form.reset();
    preview.style.display = 'none';
    preview.src = '';

    // 如果是编辑现有菜品
    if (dish) {
        document.getElementById('dish-id').value = dish.id;
        document.getElementById('dish-name').value = dish.name;
        document.getElementById('dish-price').value = dish.price;
        document.getElementById('dish-show-popup').checked = dish.show_popup;

        if (dish.image_url) {
            preview.src = dish.image_url;
            preview.style.display = 'block';
        }
    } else {
        document.getElementById('dish-id').value = '';
        document.getElementById('dish-show-popup').checked = false;
    }

    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

// 修改 hideDishForm
function hideDishForm() {
    const modal = document.getElementById('dish-modal');
    hideModal(modal);
}

// 编辑菜品
async function editDish(id) {
    try {
        const response = await fetch(`/api/admin/dishes/${id}`);
        const dish = await response.json();
        showDishForm(dish);
    } catch (error) {
        console.error('获取菜品详情失败:', error);
    }
}

// 删除菜品
async function deleteDish(id) {
    if (!confirm('确定要删除这个菜品吗？')) return;

    try {
        const response = await fetch(`/api/admin/dishes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadDishes(); // 重新加载菜品列表
        } else {
            throw new Error('删除失败');
        }
    } catch (error) {
        console.error('删除菜品失败:', error);
    }
}

// 处理菜品表单提交
async function handleDishSubmit(event) {
    event.preventDefault();

    try {
        const formData = new FormData();
        const dishId = document.getElementById('dish-id').value;
        const name = document.getElementById('dish-name').value;
        const price = document.getElementById('dish-price').value;
        const imageFile = document.getElementById('dish-image').files[0];
        const showPopup = document.getElementById('dish-show-popup').checked;

        formData.append('name', name);
        formData.append('price', price);
        formData.append('showPopup', showPopup);
        if (imageFile) {
            formData.append('image', imageFile);
        }

        const url = dishId ?
            `/api/admin/dishes/${dishId}` :
            '/api/admin/dishes';

        const method = dishId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            body: formData
        });

        if (!response.ok) {
            throw new Error('提交失败');
        }

        showNotification(dishId ? '菜品更新成功' : '菜品添加成功', 'success');
        hideDishForm();
        loadDishes();
    } catch (error) {
        console.error('提交菜品失败:', error);
        showNotification('提交失败', 'error');
    }
}

// 修改订单列表渲染，添加状态样式
function renderOrderList(orders) {
    const container = document.getElementById('orders-list');
    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <h3>订单 #${order.id}</h3>
                <div class="uname">
                    ${order.initiator}
                </div>
                <div class="order-status-actions">
                    <span class="order-status status-${order.status || 'pending'}">${getStatusText(order.status || 'pending')}</span>
                    <select onchange="updateOrderStatus(${order.id}, this.value)" class="status-select"
                            ${order.status === 'completed' ? 'disabled' : ''}>
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>待处理</option>
                        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>处理中</option>
                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>已完成</option>
                    </select>
                </div>
            </div>
            <div class="order-info">
                <p>下单时间: ${new Date(order.order_date).toLocaleString()}</p>
            </div>
            <div class="order-items">
                ${order.items}
            </div>
            <div class="order-actions">
                <button onclick="showOrderDetails(${order.id})" class="btn btn-info">查看详情</button>
            </div>
        </div>
    `).join('');
}

// 隐藏订单详情模态框
function hideOrderModal() {
    const modal = document.getElementById('order-modal');
    hideModal(modal);
}

// 初始化音频上下文
function initAudioContext() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 如果上下文被挂起，尝试恢复
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        audioInitialized = true;
    } catch (error) {
        console.error('Web Audio API 不支:', error);
        audioInitialized = false;
    }
}

// 在用户第一次点击声音按钮时初始化音频
function toggleSound() {
    const button = document.getElementById('toggle-sound');
    soundEnabled = !soundEnabled;

    // 第一次启用声音时初始化音频上下文
    if (soundEnabled && !audioInitialized) {
        initAudioContext();
    }

    // 更新���钮状态
    button.classList.toggle('sound-muted', !soundEnabled);
    button.querySelector('.sound-icon').textContent = soundEnabled ? '🔔' : '🔕';

    // 保存设置到本地存储
    localStorage.setItem('soundEnabled', soundEnabled);

    // 显示提示
    showNotification(soundEnabled ? '已开启声音提示' : '已关闭声音提示', 'info');

    // 如果开启声音，播放一个测试音
    if (soundEnabled) {
        playTestSound();
    }
}

// 播放测试音
function playTestSound() {
    if (!audioContext || audioContext.state === 'suspended') {
        initAudioContext();
    }

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 音符
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // 较低的音量
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.error('播放测试音失败:', error);
    }
}

// 修改播放通知声音函数
function playNotificationSound() {
    // 尝试使用 Web Audio API 播放声音
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        fetch('/notification.mp3')
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);
                source.start(0);
            })
            .catch(error => {
                console.error('Web Audio API 播放失败，尝试使用后备方案:', error);
                playFallbackSound();
            });
    } catch (error) {
        console.error('创建 Audio Context 失败，尝试使用后备方案:', error);
        playFallbackSound();
    }
}

function playFallbackSound() {
    // 使用 HTML5 Audio 作为后备方案
    try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(error => {
            console.error('HTML5 Audio 播放失败:', error);
        });
    } catch (error) {
        console.error('播放通知音效完全失败:', error);
    }
}

// 添加移动端手势支持
function initTouchSupport() {
    // 为图表添加触摸滑动支持
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
        let startX;
        let scrollLeft;

        chartContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].pageX - chartContainer.offsetLeft;
            scrollLeft = chartContainer.scrollLeft;
        });

        chartContainer.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const x = e.touches[0].pageX - chartContainer.offsetLeft;
            const walk = (x - startX) * 2;
            chartContainer.scrollLeft = scrollLeft - walk;
        });
    }

    // 添加下拉刷新功能
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].pageY;
    });

    document.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].pageY;
        const scroll = window.scrollY;

        if (scroll === 0 && touchY > touchStartY) {
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        const touchY = e.changedTouches[0].pageY;
        if (window.scrollY === 0 && touchY > touchStartY + 100) {
            // 刷新当前页面数据
            const currentSection = document.querySelector('.admin-section[style*="display: block"]');
            if (currentSection) {
                if (currentSection.id === 'dishes-section') {
                    loadDishes();
                } else if (currentSection.id === 'orders-section') {
                    loadOrders();
                } else if (currentSection.id === 'stats-section') {
                    loadStats();
                }
            }
        }
    });
}

// function renderOrder(order) {
//     return `
//         <div class="order-item ${order.status}" data-order-id="${order.id}">
//             <div class="order-header">
//                 <span class="order-id">订单号: ${order.id}</span>
//                 <span class="order-time">时间: ${new Date(order.timestamp).toLocaleString()}</span>
//                 <span class="order-initiator">发起人: ${order.initiator || '未知'}</span>
//             </div>
//             <div class="order-content">
//                 <div class="order-dishes">
//                     ${order.items.map(item => `
//                         <div class="order-dish">
//                             <span>${item.name}</span>
//                             <span>x${item.quantity}</span>
//                             <span>¥${item.price.toFixed(2)}</span>
//                         </div>
//                     `).join('')}
//                 </div>
//                 <div class="order-total">
//                     总计: ¥${order.total.toFixed(2)}
//                 </div>
//                 <div class="order-status">
//                     状态: ${getStatusText(order.status)}
//                 </div>
//             </div>
//             <div class="order-actions">
//                 ${renderOrderActions(order)}
//             </div>
//         </div>
//     `;
// }

// 添加备用通知声音函数
// function fallbackNotificationSound() {
//     // 使用简单的 Web Audio API 生成提示音
//     try {
//         const audioContext = new (window.AudioContext || window.webkitAudioContext)();
//         const oscillator = audioContext.createOscillator();
//         const gainNode = audioContext.createGain();
//
//         oscillator.connect(gainNode);
//         gainNode.connect(audioContext.destination);
//
//         oscillator.type = 'sine';
//         oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 音符
//
//         gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
//         gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
//
//         oscillator.start(audioContext.currentTime);
//         oscillator.stop(audioContext.currentTime + 0.5);
//     } catch (err) {
//         console.log('备用提示音也无法播放:', err);
//     }
// }
// 导航功能

// 渲染订单列表
// function renderOrderList(orders) {
//     const ordersList = document.getElementById('orders-list');
//
//     if (!Array.isArray(orders) || orders.length === 0) {
//         ordersList.innerHTML = '<div class="no-data-message"><p>暂无订单数据</p></div>';
//         return;
//     }
//
//     ordersList.innerHTML = orders.map(order => `
//         <div class="order-item ${order.status}" data-order-id="${order.id}">
//             <div class="order-header">
//                 <span class="order-id">订单号: ${order.id}</span>
//                 <span class="order-time">时间: ${new Date(order.order_date).toLocaleString()}</span>
//                 <span class="order-initiator">发起人: ${order.initiator}</span>
//             </div>
//             <div class="order-content">
//                 <div class="order-dishes">${order.items}</div>
//                 <div class="order-status">状态: ${getStatusText(order.status)}</div>
//             </div>
//             <div class="order-actions">
//                 ${renderOrderActions(order)}
//             </div>
//         </div>
//     `).join('');
// }

// 生成随机颜色
// function generateColors(count) {
//     const colors = [];
//     const baseHues = [0, 60, 120, 180, 240, 300]; // 基础色相值
//
//     for (let i = 0; i < count; i++) {
//         const hue = baseHues[i % baseHues.length];
//         const saturation = 70 + Math.random() * 10; // 70-80%
//         const lightness = 50 + Math.random() * 10; // 50-60%
//         colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
//     }
//
//     return colors;
// }

// 应用筛选器
// function applyFilters() {
//     loadOrders();
// }

// 重置筛选器
// function resetFilters() {
//     document.getElementById('order-status-filter').value = 'all';
//     document.getElementById('order-user-filter').value = 'all';
//     document.getElementById('date-range').value = 'all';
//     document.getElementById('start-date').value = '';
//     document.getElementById('end-date').value = '';
//     document.querySelector('.custom-date-range').style.display = 'none';
//     loadOrders();
// }
