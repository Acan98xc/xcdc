const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


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
        const limit = parseInt(req.query.limit) || 8;
        const category = req.query.category || null;
        const offset = (page - 1) * limit;

        // 获取最新的6个菜品的ID
        const [newItems] = await pool.query(`
            SELECT id FROM menu_items 
            ORDER BY created_at DESC 
            LIMIT 6
        `);
        const newItemIds = newItems.map(item => item.id);

        let query = `
            SELECT m.id, m.name, CAST(m.price AS DECIMAL(10,2)) AS price, 
                   m.image_url, m.category_id, c.name as category_name,
                   m.created_at,
                   CASE WHEN m.id IN (${newItemIds.join(',')}) THEN 1 ELSE 0 END as is_new
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
        `;
        
        let queryParams = [];
        
        // 新品尝鲜分类特殊处理
        if (category === '2') {
            query = `
                SELECT m.id, m.name, CAST(m.price AS DECIMAL(10,2)) AS price, 
                       m.image_url, m.category_id, c.name as category_name,
                       m.created_at, 1 as is_new
                FROM menu_items m
                LEFT JOIN categories c ON m.category_id = c.id
                WHERE m.id IN (${newItemIds.join(',')})
                ORDER BY m.created_at DESC
            `;
        } else if (category && category !== '1') {
            query += ' WHERE m.category_id = ? ORDER BY m.id LIMIT ? OFFSET ?';
            queryParams = [category, limit, offset];
        } else {
            query += ' ORDER BY m.id LIMIT ? OFFSET ?';
            queryParams = [limit, offset];
        }

        const [rows] = await pool.query(query, queryParams);
        
        // 获取总数的查询（新品分类不需要分页）
        let totalItems = 0;
        if (category !== '2') {
            let countQuery = 'SELECT COUNT(*) as total FROM menu_items';
            if (category && category !== '1') {
                countQuery += ' WHERE category_id = ?';
            }
            const [countResult] = await pool.query(
                countQuery, 
                category && category !== '1' ? [category] : []
            );
            totalItems = countResult[0].total;
        } else {
            totalItems = rows.length;
        }

        res.json({
            items: rows,
            currentPage: category === '2' ? 1 : page,
            totalPages: category === '2' ? 1 : Math.ceil(totalItems / limit),
            totalItems: totalItems
        });
    } catch (error) {
        console.error('获取菜单失败:', error);
        console.error('错误详情:', error.stack);
        res.status(500).json({ 
            error: '获取菜单失败',
            details: error.message 
        });
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
//const privateKey = fs.readFileSync('server.key', 'utf8');
//const certificate = fs.readFileSync('server.cert', 'utf8');

//const credentials = { key: privateKey, cert: certificate };

// 创建 HTTP 服务器
const server = http.createServer(app);

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 存储所有连接的WebSocket客户端
const clients = new Set();
const adminClients = new Set();

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
    console.log('新的WebSocket连接已建立');

    // 判断是否是管理端连接
    const isAdmin = req.url.includes('/admin');

    if (isAdmin) {
        // 管理端连接
        adminClients.add(ws);
        console.log(`当前管理端连接数: ${adminClients.size}`);
    } else {
        // 客户端连接
        clients.add(ws);
        console.log(`当前客户端连接数: ${clients.size}`);
    }

    // 发送连接成功消息
    ws.send(JSON.stringify({
        type: 'connection_established',
        message: '连接成功'
    }));

    // 连接关闭时移除客户端
    ws.on('close', () => {
        console.log('WebSocket连接已关闭');
        if (isAdmin) {
            adminClients.delete(ws);
            console.log(`当前管理端连接数: ${adminClients.size}`);
        } else {
            clients.delete(ws);
            console.log(`当前客户端连接数: ${clients.size}`);
        }
    });

    // 错误处理
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

// 向所有客户端广播新品通知
function broadcastNewDish(dish, message) {
    const notification = JSON.stringify({
        type: 'new_dish',
        dish: dish,
        message: message
    });

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(notification);
                console.log('成功发送新品通知到客户端');
            } catch (error) {
                console.error('发送通知失败:', error);
            }
        }
    });
}

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
        const uname = cart[0].uname;
        // 计算总金额，并确保所有值都是有效的数字
        const totalAmount = cart.reduce((total, item) => {
            const price = parseFloat(item.price);
            const quantity = parseInt(item.quantity);

            if (isNaN(price) || isNaN(quantity) || price < 0 || quantity <= 0) {
                throw new Error(`无效的价格或数量: 价格 = ${item.price}, 数量 = ${item.quantity}, 商品名称 = ${item.name}`);
            }

            return total + price * quantity;
        }, 0);

        // 插入订单，包含发起人信息
        const [orderResult] = await pool.query('INSERT INTO orders (initiator, total_amount) VALUES (?, ?)', [uname || '未知', totalAmount]);
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

app.get('/api/admin/getAllUsers', async (req, res
) => {
    try {
        const [unames] = await pool.query('SELECT distinct username FROM users');
        res.json(unames);
    } catch (error) {
        console.error('获取用户失败:', error);
        res.status(500).json({ error: '获取用户失败' });
    }
})

// 获取历史订单（带分页）
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [orders] = await pool.query(`
            SELECT o.id,
                   o.order_date,
                   o.total_amount,
                   JSON_ARRAYAGG(
                           JSON_OBJECT(
                                   'id', oi.id,
                                   'menu_item_id', oi.menu_item_id,
                                   'name', mi.name,
                                   'quantity', oi.quantity,
                                   'price', mi.price,
                                   'initiator', o.initiator
                           )
                   ) AS items
            FROM orders o
                     JOIN order_items oi ON o.id = oi.order_id
                     JOIN menu_items mi ON oi.menu_item_id = mi.id
            GROUP BY o.id
            ORDER BY o.order_date DESC LIMIT ?
            OFFSET ?
        `, [limit, offset]);

        // console.log(orders);
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

// 在数据库初始化部分添加用户通知关联表
// const createUserNotificationsTable = `
//     CREATE TABLE IF NOT EXISTS user_notifications (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         user_id VARCHAR(255) NOT NULL,
//         notification_id INT NOT NULL,
//         is_read BOOLEAN DEFAULT FALSE,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (notification_id) REFERENCES notifications(id)
//     )
// `;
// 在初始化数据库表的部分添加
// pool.query(createUserNotificationsTable)
//     .then(() => console.log('用户通知关联表创建成功'))
//     .catch(err => console.error('创建用户通知关联表失败:', err));

// 修改保存通知的函数
async function saveNotification(type, title, message, data) {
    try {
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data);

        // 保存通知，expire_at 设置为 NULL 表示永不过期
        const [result] = await pool.query(
            'INSERT INTO notifications (type, title, message, data, expire_at) VALUES (?, ?, ?, ?, NULL)',
            [type, title, message, jsonData]
        );

        const notificationId = result.insertId;

        // 获取所有用户
        const [users] = await pool.query('SELECT username FROM users');

        // 为每个用户创建通知关联
        for (const user of users) {
            await pool.query(
                'INSERT INTO user_notifications (user_id, notification_id) VALUES (?, ?)',
                [user.username, notificationId]
            );
        }

        return notificationId;
    } catch (error) {
        console.error('保存通知失败:', error);
        return null;
    }
}

// 修改获取通知的API
app.get('/api/notifications', async (req, res) => {
    try {
        // 从查询参数获取用户名
        const username = req.query.username;
        if (!username) {
            return res.status(400).json({ error: '缺少用户名参数' });
        }

        // 获取用户的未读通知，除过时间检查
        const [notifications] = await pool.query(`
            SELECT 
                n.id,
                n.type,
                n.title,
                n.message,
                CAST(n.data AS CHAR) as data,
                n.created_at,
                n.is_active,
                un.is_read
            FROM notifications n
            JOIN user_notifications un ON n.id = un.notification_id
            WHERE un.user_id = ?
            AND n.is_active = TRUE 
            ORDER BY n.created_at DESC
        `, [username]);

        const formattedNotifications = notifications.map(notification => ({
            ...notification,
            data: notification.data ? JSON.parse(notification.data) : null
        }));

        res.json(formattedNotifications);
    } catch (error) {
        console.error('获取通知失败:', error);
        res.status(500).json({ error: '获取通知失败' });
    }
});

// 修改标记通知为已读的API
app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        const username = req.body.username;
        if (!username) {
            return res.status(400).json({ error: '缺少用户名参数' });
        }

        await pool.query(
            'UPDATE user_notifications SET is_read = TRUE WHERE user_id = ? AND notification_id = ?',
            [username, req.params.id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('标记通知已读失败:', error);
        res.status(500).json({ error: '标记通知已读失败' });
    }
});

// 修改添加新菜品的API
app.post('/api/admin/dishes', upload.single('image'), async (req, res) => {
    try {
        const { name, price, showPopup } = req.body;
        const image_url = req.file ? `/images/${req.file.filename}` : null;

        const [result] = await pool.query(
            'INSERT INTO menu_items (name, price, image_url, show_popup) VALUES (?, ?, ?, ?)',
            [name, price, image_url, showPopup === 'true']
        );

        const newDish = {
            id: result.insertId,
            name,
            price,
            image_url
        };

        // 如果需要弹窗提醒，保存通知并推送
        if (showPopup === 'true') {
            // 保存通知到数据库
            const notificationId = await saveNotification(
                'new_dish',
                '新品推荐',
                `新品上架：${name}`,
                newDish
            );

            if (notificationId) {
                // 向在线客户端推送通知
                const message = JSON.stringify({
                    type: 'new_dish',
                    dish: newDish,
                    message: `新品上架：${name}`,
                    notificationId: notificationId
                });

                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        try {
                            client.send(message);
                        } catch (error) {
                            console.error('发送通知失败:', error);
                        }
                    }
                });
            }
        }

        res.status(201).json({ id: result.insertId });
    } catch (error) {
        console.error('添加菜品失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改更新菜品
app.put('/api/admin/dishes/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, price, showPopup } = req.body;
        const image_url = req.file ? `/images/${req.file.filename}` : undefined;

        let sql = 'UPDATE menu_items SET name = ?, price = ?, show_popup = ?';
        let params = [name, price, showPopup === 'true'];

        if (image_url) {
            sql += ', image_url = ?';
            params.push(image_url);
        }

        sql += ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(sql, params);

        // 如果需要弹窗提醒，向所有客户端推送更新通知
        if (showPopup === 'true') {
            const updatedDish = {
                id: parseInt(req.params.id),
                name,
                price,
                image_url: image_url || null
            };

            // 向所有客户端推送更新通知
            const message = JSON.stringify({
                type: 'dish_updated',
                dish: updatedDish,
                message: `菜品更新：${name}`
            });

            adminClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('更新菜品失败:', error);
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
        const { status, startDate, endDate, initiator } = req.query;
        let sql = `
            SELECT o.id, o.initiator, o.order_date, o.status, o.total_amount,
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

        // 发起人筛选
        if (initiator && initiator !== 'all') {
            conditions.push('o.initiator = ?');
            params.push(initiator);
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
            GROUP BY o.id, o.initiator, o.order_date, o.status, o.total_amount 
            ORDER BY o.order_date DESC
        `;

        const [rows] = await pool.query(sql, params);

        // 获取所有发起人列表
        const [initiators] = await pool.query(`
            SELECT DISTINCT initiator 
            FROM orders 
            WHERE initiator IS NOT NULL 
            ORDER BY initiator
        `);

        // 格式化数据
        const formattedRows = rows.map(row => ({
            ...row,
            initiator: row.initiator || '未知',
            order_date: row.order_date,
            total_amount: parseFloat(row.total_amount).toFixed(2),
            status: row.status || 'pending',
            items: row.items || '暂无商品'
        }));

        res.json({
            orders: formattedRows,
            initiators: initiators.map(i => i.initiator).filter(Boolean)
        });
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
            SELECT o.id,
                   o.initiator,
                   o.order_date,
                   o.status,
                   o.total_amount,
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
            GROUP BY o.id, o.initiator
        `, [req.params.id]);

        if (orders.length === 0) {
            return res.status(404).json({ error: '订单不存在' });
        }

        // 确保发起人信息存在
        orders[0].initiator = orders[0].initiator || '未知';

        res.json(orders[0]);
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改统计数据接口
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { period, initiator } = req.query;
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
                // 取最早的订单日期
                const [earliest] = await pool.query(`
                    SELECT MIN(order_date) as earliest_date 
                    FROM orders
                    ${initiator && initiator !== 'all' ? 'WHERE initiator = ?' : ''}
                `, initiator && initiator !== 'all' ? [initiator] : []);
                if (earliest[0].earliest_date) {
                    startDate = new Date(earliest[0].earliest_date);
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(23, 59, 59, 999);
                }
                break;
        }

        // 构建基础的WHERE条件
        const whereConditions = ['order_date BETWEEN ? AND ?'];
        const queryParams = [startDate, endDate];

        if (initiator && initiator !== 'all') {
            whereConditions.push('initiator = ?');
            queryParams.push(initiator);
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // 获取订单统计数据
        const [orderStats] = await pool.query(`
            SELECT 
                COUNT(*) as orderCount,
                COALESCE(SUM(total_amount), 0) as totalRevenue,
                COUNT(DISTINCT DATE(order_date)) as activeDays,
                MIN(order_date) as firstOrderDate,
                MAX(order_date) as lastOrderDate
            FROM orders
            ${whereClause}
        `, queryParams);

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
            ${whereClause}
            GROUP BY mi.id, mi.name
            HAVING totalQuantity > 0
            ORDER BY totalQuantity DESC
            LIMIT 10
        `, queryParams);

        // 获取所有发起人列表（用于前端筛选）
        const [initiators] = await pool.query(`
            SELECT DISTINCT initiator 
            FROM orders 
            WHERE initiator IS NOT NULL 
            ORDER BY initiator
        `);

        // 计算每日平均营业额
        const activeDays = Math.max(1, orderStats[0].activeDays);
        const averageDailyRevenue = Number(orderStats[0].totalRevenue) / activeDays;

        // 计算平订单金额
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
            initiator: initiator,
            dateRange: {
                start: startDate,
                end: endDate
            },
            initiators: initiators.map(i => i.initiator).filter(Boolean),
            popularDishes: popularDishes.map(dish => ({
                id: dish.id,
                name: dish.name,
                orderCount: Number(dish.orderCount) || 0,
                totalQuantity: Number(dish.totalQuantity) || 0,
                totalRevenue: parseFloat((Number(dish.totalRevenue) || 0).toFixed(2))
            }))
        };

        // 添加调试日志
        // console.log('统计数据:', JSON.stringify(stats, null, 2));

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

// 用户注册接口
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10); // 哈希密码

    try {
        const [result] = await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({ error: '注册失败' });
    }
});

// 用户登录接口
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    // console.log(password);

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.status(401).json({ error: '未注册用户' });
        }
        // console.log(rows)
        const user = rows[0];
        // const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        // if (!isPasswordValid) {
        //     return res.status(401).json({ error: '用户名或密码错误' });
        // }
        if (username !== user['username'] || password !== user['password']) {
            return res.status(401).json({ error: '用户名或密码错误!' });

        }
        // 生成 JWT
        const token = jwt.sign({ id: user.id, username: user.username }, 'your_jwt_secret', { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ error: '登录失败' });

    }
});

// 添加搜索路由
app.get('/api/menu/search', async (req, res) => {
    try {
        const query = req.query.query || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const offset = (page - 1) * limit;

        const searchPattern = `%${query}%`;

        // 修改查询方式，使用字符串拼接的方式处理 LIMIT 和 OFFSET
        const searchQuery = `
            SELECT id, name, price, image_url 
            FROM menu_items 
            WHERE name LIKE ? OR description LIKE ?
        `;

        // ���行搜索查询
        const [items] = await pool.query(
            searchQuery + ` LIMIT ${limit} OFFSET ${offset}`, 
            [searchPattern, searchPattern]
        );
        
        // 计算总数的查询
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM menu_items 
            WHERE name LIKE ? OR description LIKE ?
        `;

        // 获取总数
        const [countResult] = await pool.query(countQuery, [searchPattern, searchPattern]);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            items,
            currentPage: page,
            totalPages,
            total
        });

    } catch (error) {
        console.error('搜索菜品失败:', error);
        res.status(500).json({ error: '搜索失败' });
    }
});

// 获取所有分类
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories ORDER BY sort_order');
        res.json(categories);
    } catch (error) {
        console.error('获取分类失败:', error);
        res.status(500).json({ error: '获取分类失败' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));
