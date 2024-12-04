const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public/images'))
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });

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

// 读取自签名证书和私钥
const privateKey = fs.readFileSync('server.key', 'utf8');
const certificate = fs.readFileSync('server.cert', 'utf8');

const credentials = { key: privateKey, cert: certificate };

// 创建 HTTPS 服务器
const server = https.createServer(credentials, app);

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 存储所有连接的管理端 WebSocket 客户端
const adminClients = new Set();

// WebSocket 连接处理
wss.on('connection', (ws) => {
    console.log('新的WebSocket连接已建立');

    // 将新连接的客户端添加到集合中
    adminClients.add(ws);
    console.log(`当前活动连接数: ${adminClients.size}`);

    // 发送测试消息
    ws.send(JSON.stringify({
        type: 'connection_established',
        message: '连接成功'
    }));

    // 连接关闭时移除客户端
    ws.on('close', () => {
        console.log('WebSocket连接已关闭');
        adminClients.delete(ws);
        console.log(`当前活动连接数: ${adminClients.size}`);
    });

    // 错误处理
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

// 广播新订单通知给所有管理端
function broadcastNewOrder(orderId) {
    const message = JSON.stringify({
        type: 'new_order',
        orderId: orderId,
        timestamp: new Date().toISOString()
    });

    console.log(`准备广播新订单通知, 当前连接数: ${adminClients.size}`);
    console.log('广播消息:', message);

    adminClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
                console.log('成功发送通知到客户端');
            } catch (error) {
                console.error('发送通知失败:', error);
            }
        } else {
            console.log('客户端连接未就绪，状态:', client.readyState);
        }
    });
}

// 修改提交订单的接口，添加通知功能
app.post('/api/orders', async (req, res) => {
    try {
        const cart = req.body;
        // console.log('Received cart:', JSON.stringify(cart, null, 2));

        // 验证购物车数据
        if (!Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: '无效的购物车数据' });
        }

        // 计算总金额，并确保所有值都是有效的数字
        const totalAmount = cart.reduce((total, item) => {
            const price = parseFloat(item.price);
            const quantity = parseInt(item.quantity);

            console.log(`Item: ${item.name}, Price: ${price}, Quantity: ${quantity}`);

            if (isNaN(price) || isNaN(quantity) || price < 0 || quantity <= 0) {
                throw new Error(`无效的价格或数量: 价格 = ${item.price}, 数量 = ${item.quantity}, 商品名称 = ${item.name}`);
            }

            return total + price * quantity;
        }, 0);

        // console.log('Total amount:', totalAmount);

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

        // 订单创建成功后，发送通知
        broadcastNewOrder(orderId);

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

        // console.log(`Refreshed menu item: ${JSON.stringify(rows[0])}`);
        res.json(rows[0]);
    } catch (error) {
        console.error('获取菜品信息失败:', error);
        res.status(500).json({ error: '获取菜品信息失败' });
    }
});

// 修改获取所有菜品（管理员接口）
app.get('/api/admin/dishes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, CAST(price AS DECIMAL(10,2)) AS price, image_url FROM menu_items ORDER BY id DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 修改获取单个菜品详情
app.get('/api/admin/dishes/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, CAST(price AS DECIMAL(10,2)) AS price, image_url FROM menu_items WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: '菜品不存在' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 修改添加新菜品
app.post('/api/admin/dishes', upload.single('image'), async (req, res) => {
    try {
        const { name, price } = req.body;
        const image_url = req.file ? `/images/${req.file.filename}` : null;

        const [result] = await pool.query(
            'INSERT INTO menu_items (name, price, image_url) VALUES (?, ?, ?)',
            [name, price, image_url]
        );

        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 修改更新菜品
app.put('/api/admin/dishes/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, price } = req.body;
        const image_url = req.file ? `/images/${req.file.filename}` : undefined;

        let sql = 'UPDATE menu_items SET name = ?, price = ?';
        let params = [name, price];

        if (image_url) {
            sql += ', image_url = ?';
            params.push(image_url);
        }

        sql += ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(sql, params);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 修改删除菜品
app.delete('/api/admin/dishes/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM menu_items WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 修改获取订单列表的接口，添加状态筛选
app.get('/api/admin/orders', async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;
        let sql = `
            SELECT o.id, o.order_date, o.status, o.total_amount,
                   GROUP_CONCAT(
                       CONCAT(mi.name, ' x', oi.quantity)
                       SEPARATOR ', '
                   ) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        `;

        const params = [];
        const conditions = ['o.is_deleted = FALSE'];

        // 状态筛选
        if (status && status !== 'all') {
            conditions.push('o.status = ?');
            params.push(status);
        }

        // 日期范围筛选
        if (startDate) {
            conditions.push('DATE(o.order_date) >= ?');
            params.push(startDate);
        }
        if (endDate) {
            conditions.push('DATE(o.order_date) <= ?');
            params.push(endDate);
        }

        // 添加 WHERE 子句
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        // 分组和排序
        sql += ` 
            GROUP BY o.id, o.order_date, o.status, o.total_amount 
            ORDER BY o.order_date DESC
        `;

        console.log('SQL Query:', sql); // 调试日志
        console.log('Parameters:', params); // 调试日志

        const [rows] = await pool.query(sql, params);

        // 格式化返回的数据
        const formattedRows = rows.map(row => ({
            ...row,
            order_date: row.order_date,
            total_amount: parseFloat(row.total_amount).toFixed(2),
            status: row.status || 'pending',
            items: row.items || '暂无商品'
        }));

        res.json(formattedRows);
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 更新订单状态的路由
app.put('/api/admin/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // 验证状态值
        const validStatuses = ['pending', 'processing', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: '无效的订单状态' });
        }

        if (status === 'completed') {
            // 如果状态是已完成，同时更新状态和完成时间
            await pool.query(
                'UPDATE orders SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, id]
            );
        } else {
            // 其他状态只更新状态
            await pool.query(
                'UPDATE orders SET status = ?, completed_at = NULL WHERE id = ?',
                [status, id]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改订单详情接口，添加状态信息
app.get('/api/admin/orders/:id', async (req, res) => {
    try {
        const [orders] = await pool.query(`
            SELECT o.id, o.order_date, o.status, o.total_amount,
                   JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'id', oi.id,
                           'name', mi.name,
                           'quantity', oi.quantity,
                           'price', mi.price
                       )
                   ) as items
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE o.id = ?
            GROUP BY o.id
        `, [req.params.id]);

        if (orders.length === 0) {
            return res.status(404).json({ error: '订单不存在' });
        }

        res.json(orders[0]);
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改统计数据接口
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { period } = req.query;
        let startDate = new Date();
        let endDate = new Date();

        // 设置时间范围
        switch (period) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'all':
            default:
                // 获取最早的订单日期
                const [earliest] = await pool.query(`
                    SELECT MIN(order_date) as earliest_date 
                    FROM orders
                `);
                if (earliest[0].earliest_date) {
                    startDate = new Date(earliest[0].earliest_date);
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(23, 59, 59, 999);
                }
                break;
        }

        console.log('查询时间范围:', {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            period
        });

        // 获取订单统计数据
        const [orderStats] = await pool.query(`
            SELECT 
                COUNT(*) as orderCount,
                COALESCE(SUM(total_amount), 0) as totalRevenue,
                COUNT(DISTINCT DATE(order_date)) as activeDays,
                MIN(order_date) as firstOrderDate,
                MAX(order_date) as lastOrderDate
            FROM orders
            WHERE order_date BETWEEN ? AND ?
        `, [startDate, endDate]);

        // 修改热销菜品查询
        const [popularDishes] = await pool.query(`
            SELECT 
                mi.id,
                mi.name,
                COUNT(DISTINCT o.id) as orderCount,
                SUM(oi.quantity) as totalQuantity,
                COALESCE(SUM(oi.quantity * mi.price), 0) as totalRevenue
            FROM menu_items mi
            LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
            LEFT JOIN orders o ON oi.order_id = o.id 
            WHERE o.order_date BETWEEN ? AND ?
            GROUP BY mi.id, mi.name
            HAVING totalQuantity > 0
            ORDER BY totalQuantity DESC
            LIMIT 10
        `, [startDate, endDate]);

        // 计算每日平均营业额
        const activeDays = Math.max(1, orderStats[0].activeDays);
        const averageDailyRevenue = Number(orderStats[0].totalRevenue) / activeDays;

        // 计算平均订单金额
        const orderCount = Math.max(1, Number(orderStats[0].orderCount));
        const averageOrderAmount = Number(orderStats[0].totalRevenue) / orderCount;

        // 格式化数据
        const stats = {
            orderCount: Number(orderStats[0].orderCount),
            totalRevenue: Number(orderStats[0].totalRevenue),
            averageOrderAmount: parseFloat(averageOrderAmount.toFixed(2)),
            averageDailyRevenue: parseFloat(averageDailyRevenue.toFixed(2)),
            activeDays: orderStats[0].activeDays,
            firstOrderDate: orderStats[0].firstOrderDate,
            lastOrderDate: orderStats[0].lastOrderDate,
            period: period,
            dateRange: {
                start: startDate,
                end: endDate
            },
            popularDishes: popularDishes.map(dish => ({
                id: dish.id,
                name: dish.name,
                orderCount: Number(dish.orderCount) || 0,
                totalQuantity: Number(dish.totalQuantity) || 0,
                totalRevenue: parseFloat((Number(dish.totalRevenue) || 0).toFixed(2))
            }))
        };

        // 添加调试日志
        console.log('统计数据:', JSON.stringify(stats, null, 2));

        res.json(stats);
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改删除订单的接口为软删除
app.delete('/api/admin/orders/:id', async (req, res) => {
    try {
        await pool.query(
            'UPDATE orders SET is_deleted = TRUE WHERE id = ?',
            [req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));