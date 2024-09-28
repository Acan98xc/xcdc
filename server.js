const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const app = express();

// 数据库连接
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',  // 替换为您的 MySQL 用户名
    password: 'acan',  // 替换为您的 MySQL 密码
    database: 'restaurant_db'
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 在其他路由之前添加这个
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 获取菜单（带分页）
app.get('/api/menu', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [rows] = await pool.query('SELECT id, name, CAST(price AS DECIMAL(10,2)) AS price, image_url FROM menu_items ORDER BY id LIMIT ? OFFSET ?', [limit, offset]);
        const [countResult] = await pool.query('SELECT COUNT(*) as total FROM menu_items');
        const totalItems = countResult[0].total;

        res.json({
            items: rows,
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems: totalItems
        });
    } catch (error) {
        console.error('获取菜单失败:', error);
        res.status(500).json({ error: '获取菜单失败' });
    }
});

// 初始化菜单数据
app.get('/api/init-menu', async (req, res) => {
    try {
        const menuItems = [
            { name: '宫保鸡丁', price: 38, image_url: '/images/kung_pao_chicken.jpg' },
            { name: '麻婆豆腐', price: 28, image_url: '/images/mapo_tofu.jpg' },
            { name: '鱼香肉丝', price: 36, image_url: '/images/yu_xiang_rou_si.jpg' },
            { name: '糖醋里脊', price: 42, image_url: '/images/sweet_and_sour_pork.jpg' },
            { name: '北京烤鸭', price: 98, image_url: '/images/peking_duck.jpg' }
        ];
        const [existingItems] = await pool.query('SELECT * FROM menu_items');
        if (existingItems.length > 0) {
            return res.json({ message: '菜单已经初始化' });
        }

        for (const item of menuItems) {
            await pool.query('INSERT INTO menu_items (name, price, image_url) VALUES (?, ?, ?)', [item.name, item.price, item.image_url]);
        }
        res.json({ message: '菜单初始化成功' });
    } catch (error) {
        console.error('初始化菜单失败:', error);
        res.status(500).json({ error: '初始化菜单失败' });
    }
});

// 提交订单
app.post('/api/orders', async (req, res) => {
    try {
        const cart = req.body;
        console.log('Received cart:', JSON.stringify(cart, null, 2));

        // 验证购物车数据
        if (!Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: '无效的购物车数据' });
        }

        // 计算总金额，并确保所有值都是有效的数字
        const totalAmount = cart.reduce((total, item) => {
            const price = parseFloat(item.price);
            const quantity = parseInt(item.quantity);

            console.log(`Item: ${item.name}, Price: ${price}, Quantity: ${quantity}`);

            if (isNaN(price) || isNaN(quantity) || price <= 0 || quantity <= 0) {
                throw new Error(`无效的价格或数量: 价格 = ${item.price}, 数量 = ${item.quantity}, 商品名称 = ${item.name}`);
            }

            return total + price * quantity;
        }, 0);

        console.log('Total amount:', totalAmount);

        // 插入订单
        const [orderResult] = await pool.query('INSERT INTO orders (total_amount) VALUES (?)', [totalAmount]);
        const orderId = orderResult.insertId;

        // 插入订单项
        for (const item of cart) {
            const menuItemId = parseInt(item.id);
            const quantity = parseInt(item.quantity);

            if (isNaN(menuItemId) || isNaN(quantity) || menuItemId <= 0 || quantity <= 0) {
                throw new Error(`无效的菜品ID或数量: ID = ${item.id}, 数量 = ${item.quantity}`);
            }

            await pool.query('INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES (?, ?, ?)',
                [orderId, menuItemId, quantity]);
        }

        res.json({ message: '订单提交成功', orderId });
    } catch (error) {
        console.error('提交订单失败:', error);
        res.status(500).json({ error: '提交订单失败: ' + error.message });
    }
});

// 获取历史订单（带分页）
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [orders] = await pool.query(`
            SELECT o.id, o.order_date, o.total_amount,
                   JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'id', oi.id,
                           'menu_item_id', oi.menu_item_id,
                           'name', mi.name,
                           'quantity', oi.quantity,
                           'price', mi.price
                       )
                   ) AS items
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            GROUP BY o.id
            ORDER BY o.order_date DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const [countResult] = await pool.query('SELECT COUNT(*) as total FROM orders');
        const totalItems = countResult[0].total;

        res.json({
            orders: orders,
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems: totalItems
        });
    } catch (error) {
        console.error('获取历史订单失败:', error);
        res.status(500).json({ error: '获取历史订单失败' });
    }
});

// 获取所有菜品
app.get('/api/all-menu-items', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name,price FROM menu_items');
        res.json(rows);
    } catch (error) {
        console.error('获取所有菜品失败:', error);
        res.status(500).json({ error: '获取所有菜品失败' });
    }
});

// 获取最新的菜品信息
app.get('/api/refresh-menu-item/:id', async (req, res) => {
    try {
        const itemId = parseInt(req.params.id);
        if (isNaN(itemId) || itemId <= 0) {
            return res.status(400).json({ error: '无效的菜品ID' });
        }

        const [rows] = await pool.query('SELECT id, name, CAST(price AS DECIMAL(10,2)) AS price FROM menu_items WHERE id = ?', [itemId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: '菜品未找到' });
        }

        console.log(`Refreshed menu item: ${JSON.stringify(rows[0])}`);
        res.json(rows[0]);
    } catch (error) {
        console.error('获取菜品信息失败:', error);
        res.status(500).json({ error: '获取菜品信息失败' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));