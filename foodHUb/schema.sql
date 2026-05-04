-- ═══════════════════════════════════════════════════════
--  FoodHub — Robust Production Schema v3
--  Run: mysql -u root -p < schema.sql
--  Requires: MySQL 8.0+ or MariaDB 10.4+
-- ═══════════════════════════════════════════════════════

DROP DATABASE IF EXISTS foodhub;
CREATE DATABASE foodhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE foodhub;

-- ─────────────────────────────────────────────
--  USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('customer','seller','admin') NOT NULL DEFAULT 'customer',
  phone      VARCHAR(20),
  address    TEXT,
  avatar     CHAR(2)      DEFAULT 'U',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role  (role)
);

-- ─────────────────────────────────────────────
--  USER SOCIALS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_socials (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   INT NOT NULL,
  platform  ENUM('instagram','whatsapp') NOT NULL,
  handle    VARCHAR(100) NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY  uq_user_platform (user_id, platform),
  INDEX idx_handle (handle)
);

-- ─────────────────────────────────────────────
--  DELIVERY AGENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100) NOT NULL,
  phone     VARCHAR(20)  UNIQUE,
  available TINYINT(1)   DEFAULT 1,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_available (available)
);

-- ─────────────────────────────────────────────
--  RESTAURANTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  cuisine    VARCHAR(100),
  emoji      VARCHAR(10)  DEFAULT '🍽️',
  bg         VARCHAR(20)  DEFAULT '#FFF5EE',
  rating     DECIMAL(3,1) DEFAULT 4.0 CHECK (rating BETWEEN 0 AND 5),
  is_active  TINYINT(1)   DEFAULT 1,
  owner_id   INT,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_is_active (is_active)
);

-- ─────────────────────────────────────────────
--  MENU ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  name          VARCHAR(150) NOT NULL,
  category      VARCHAR(100) DEFAULT 'General',
  emoji         VARCHAR(10)  DEFAULT '🍽️',
  price         DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  stock         INT           DEFAULT 0 CHECK (stock >= 0),
  description   TEXT,
  available     TINYINT(1)   DEFAULT 1,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  INDEX idx_restaurant (restaurant_id),
  INDEX idx_available  (available)
);

-- ─────────────────────────────────────────────
--  PROMOS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promos (
  code       VARCHAR(30) PRIMARY KEY,
  discount   DECIMAL(10,2) NOT NULL CHECK (discount >= 0),
  label      VARCHAR(200),
  is_active  TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP  DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  restaurant_id INT NOT NULL,
  total_amount  DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  status        ENUM('PLACED','CONFIRMED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')
                DEFAULT 'PLACED',
  agent_id      INT,
  source        ENUM('web','instagram','whatsapp') DEFAULT 'web',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id)      REFERENCES agents(id)      ON DELETE SET NULL,
  INDEX idx_user_id       (user_id),
  INDEX idx_restaurant_id (restaurant_id),
  INDEX idx_status        (status),
  INDEX idx_created_at    (created_at)
);

-- ─────────────────────────────────────────────
--  ORDER ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  menu_item_id  INT NOT NULL,
  quantity      INT           DEFAULT 1 CHECK (quantity > 0),
  price         DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)     REFERENCES orders(id)     ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  INDEX idx_order_id (order_id)
);

-- ─────────────────────────────────────────────
--  NOTIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  message    TEXT NOT NULL,
  is_read    TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_unread (user_id, is_read)
);

-- ─────────────────────────────────────────────
--  RATINGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  customer_id   INT NOT NULL,
  restaurant_id INT NOT NULL,
  order_id      INT,
  stars         TINYINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id)   REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id)      REFERENCES orders(id)      ON DELETE SET NULL,
  UNIQUE KEY uq_customer_order (customer_id, order_id),
  INDEX idx_restaurant (restaurant_id)
);

-- ═══════════════════════════════════════════════════════
--  SEED DATA
--  NOTE: Passwords are stored as bcrypt hashes of "password123"
--        Generated with: password_hash('password123', PASSWORD_BCRYPT)
-- ═══════════════════════════════════════════════════════

INSERT INTO agents (name, phone, available) VALUES
('Raj Driver',   '8000000001', 1),
('Suresh Kumar', '8000000002', 1),
('Arun Vel',     '8000000003', 0);

-- FIX: Use bcrypt hashes so password_verify() works in login.php
--      All accounts use password: password123
INSERT INTO users (name, email, password, role, phone, address, avatar) VALUES
('Himesh Soni',  'himesh@email.com',   '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'customer', '9876543210', '42, 3rd Cross Street, Chennai', 'R'),
('Priya Sharma', 'priya@email.com',   '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'customer', '9876500001', 'Mumbai',    'P'),
('Ravi Kumar',   'ravi@seller.com',   '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'seller',   '9876500002', 'Chennai',   'R'),
('Admin User',   'admin@food.com',    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',    '9000000000', 'HQ',        'A'),
('Priya Patel',  'priya2@seller.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'seller',   '9876500005', 'Pune',      'P'),
('Amit Kumar',   'amit@email.com',    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'customer', '9876500003', 'Delhi',     'A'),
('Karan Doshi',  'karan@email.com',   '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'customer', '9876500007', 'Hyderabad', 'K');

INSERT INTO user_socials (user_id, platform, handle) VALUES
(1, 'instagram', 'hx.cr3'),
(2, 'instagram', 'priya_sharma_ig'),
(3, 'instagram', 'spice_garden_official');

INSERT INTO restaurants (name, cuisine, emoji, bg, rating, is_active, owner_id) VALUES
('Royal Punjab',   'North Indian', '🍛', '#FFF5EE', 4.8, 1, 3),
('Crust & Co.',    'Italian',      '🍕', '#FFF0F5', 4.7, 1, 3),
('Burger House',   'American',     '🍔', '#FFFDE7', 4.6, 1, 5),
('Dakshin Delight','South Indian', '🍲', '#E8F5E9', 4.9, 1, 5),
('Wok & Roll',     'Chinese',      '🥢', '#F0FFF4', 4.2, 1, 5);

INSERT INTO menu_items (restaurant_id, name, category, emoji, price, stock, description, available) VALUES
-- Royal Punjab (North Indian)
(1, 'Dal Chawal Combo', 'Main Course', '🍚', 180, 30, 'Classic yellow dal tadka served with aromatic basmati rice', 1),
(1, 'Kadhai Paneer',    'Main Course', '🥘', 260, 25, 'Cottage cheese cooked with bell peppers, onions and freshly ground spices', 1),
(1, 'Mushroom Masala',  'Main Course', '🍄', 240, 20, 'Button mushrooms in a rich, spicy tomato-onion gravy', 1),
(1, 'Butter Chicken',   'Main Course', '🍗', 320, 20, 'Tender chicken in a creamy, velvety tomato sauce', 1),
(1, 'Garlic Naan',      'Breads',      '🫓', 70, 60, 'Soft, clay-oven baked leavened bread with garlic and butter', 1),
(1, 'Butter Naan',      'Breads',      '🫓', 60, 50, 'Plain leavened bread with a generous glaze of butter', 1),
(1, 'Bottled Water',    'Drinks',      '💧', 20, 100, 'Chilled mineral water (500ml)', 1),

-- Crust & Co. (Pizza)
(2, 'Margherita Pizza', 'Pizza', '🍕', 350, 15, 'Classic mozzarella and tomato basil. Choice of Pan or Thin Crust.', 1),
(2, 'Pepperoni Feast',  'Pizza', '🍕', 450, 10, 'Double pepperoni with extra mozzarella on a hand-tossed base', 1),
(2, 'Veggie Supreme',   'Pizza', '🍕', 390, 15, 'Onions, capsicum, mushroom, corn and black olives', 1),
(2, 'Cheese Burst Add-on', 'Crusts', '🧀', 99, 50, 'Upgrade your pizza with a crust overflowing with liquid cheese', 1),
(2, 'Thin Crust Upgrade',  'Crusts', '🍕', 40, 50, 'Light and crispy thin crust for a classic Italian feel', 1),
(2, 'Extra Jalapenos',  'Toppings', '🌶️', 30, 100, 'Spicy jalapeno slices for an extra kick', 1),
(2, 'Extra Olives',     'Toppings', '🫒', 30, 100, 'Premium black olives for a Mediterranean touch', 1),
(2, 'Bottled Water',    'Drinks', '💧', 20, 100, 'Chilled mineral water (500ml)', 1),

-- Burger House (Burgers)
(3, 'Classic Veg Burger', 'Burgers', '🍔', 180, 40, 'Crispy veg patty, lettuce, mayo and tomatoes in a toasted bun', 1),
(3, 'Zinger Burger',      'Burgers', '🍔', 240, 30, 'Spicy crispy chicken breast with lettuce and zingy dressing', 1),
(3, 'Cheese Melt Burger', 'Burgers', '🍔', 220, 25, 'Grilled patty topped with double molten cheddar cheese', 1),
(3, 'Crispy Fries',       'Sides',   '🍟', 110, 60, 'Perfectly salted golden crispy fries', 1),
(3, 'Bottled Water',      'Drinks',  '💧', 20, 100, 'Chilled mineral water (500ml)', 1),

-- Dakshin Delight (South Indian)
(4, 'Masala Dosa',    'South Indian', '🍛', 160, 45, 'Crispy rice crepe filled with spiced potato mash, served with sambhar and chutneys', 1),
(4, 'Idli Sambhar',   'South Indian', '🍲', 110, 60, 'Soft steamed rice cakes served with flavor-packed lentil soup', 1),
(4, 'Medu Vada',      'South Indian', '🍩', 120, 40, 'Crispy deep-fried lentil donuts with a soft center', 1),
(4, 'Filter Coffee',  'Drinks',       '☕', 45, 50, 'Traditional South Indian coffee brewed with perfection', 1),
(4, 'Bottled Water',  'Drinks',       '💧', 20, 100, 'Chilled mineral water (500ml)', 1),

-- Wok & Roll (Chinese)
(5, 'Veg Fried Rice', 'Main Course', '🍚', 190, 30, 'Fragrant jasmine rice tossed with fresh garden vegetables', 1),
(5, 'Hakka Noodles',  'Main Course', '🍜', 210, 25, 'Stir-fried noodles with a medley of vegetables and soy sauce', 1),
(5, 'Bottled Water',  'Drinks',      '💧', 20, 100, 'Chilled mineral water (500ml)', 1);


INSERT INTO promos (code, discount, label) VALUES
('WELCOME20', 20,  '20% off for new users'),
('FLAT50',    50,  'Flat ₹50 off'),
('SAVE10',    10,  '₹10 off on orders above ₹400');

INSERT INTO orders (user_id, restaurant_id, total_amount, status, agent_id, source) VALUES
(1, 1, 680,  'DELIVERED',        1, 'web'),
(2, 2, 680,  'OUT_FOR_DELIVERY', 2, 'web'),
(6, 3, 480,  'PREPARING',     NULL, 'web'),
(7, 4, 460,  'PLACED',        NULL, 'web'),
(7, 1, 620,  'CONFIRMED',     NULL, 'web'),
(1, 2, 640,  'DELIVERED',        1, 'web');

INSERT INTO order_items (order_id, menu_item_id, quantity, price) VALUES
(1, 1, 2, 280), (1, 3, 2, 60),
(2, 8, 1, 380), (2, 10, 2, 150),
(3, 12, 2, 180), (3, 14, 1, 120),
(4, 16, 1, 220), (4, 18, 2, 120),
(5, 2, 2, 220), (5, 3, 3, 60),
(6, 7, 2, 320);

INSERT INTO ratings (customer_id, restaurant_id, order_id, stars, comment) VALUES
(1, 1, 1, 5, 'Amazing butter chicken! Will order again.'),
(1, 2, 6, 4, 'Great pizza, slightly delayed delivery.');

INSERT INTO notifications (user_id, message, is_read) VALUES
(1, 'Your order <strong>ORD-2</strong> is out for delivery! ETA ~15 min.', 0),
(1, '<strong>Pizza Republic</strong> confirmed your last order.', 0),
(2, 'Your order has been placed successfully!', 1),
(6, 'Your order is being prepared by the chef.', 0),
(7, 'New restaurant <strong>Taco Fiesta</strong> opened near you!', 1);

-- ═══════════════════════════════════════════════════════
--  VIEWS
-- ═══════════════════════════════════════════════════════

-- FIX: Added user_id and restaurant_id — required by buildOrderRows() in order.php
CREATE OR REPLACE VIEW view_order_details AS
SELECT
  o.id            AS order_id,
  o.user_id,                          -- FIX: was missing, buildOrderRows needs this
  o.restaurant_id,                    -- FIX: was missing, buildOrderRows needs this
  o.status,
  o.total_amount  AS amount,
  o.source,
  o.created_at,
  u.name          AS customer,
  u.email         AS customer_email,
  r.name          AS rest_name,
  a.name          AS agent_name,
  GROUP_CONCAT(mi.name ORDER BY oi.id SEPARATOR ', ') AS items
FROM orders o
JOIN users       u  ON o.user_id       = u.id
JOIN restaurants r  ON o.restaurant_id = r.id
LEFT JOIN agents a  ON o.agent_id      = a.id
LEFT JOIN order_items oi ON o.id       = oi.order_id
LEFT JOIN menu_items  mi ON oi.menu_item_id = mi.id
GROUP BY o.id, o.user_id, o.restaurant_id, o.status, o.total_amount, o.source,
         o.created_at, u.name, u.email, r.name, a.name;

-- View 2: Restaurant revenue summary
CREATE OR REPLACE VIEW view_restaurant_revenue AS
SELECT
  r.id            AS restaurant_id,
  r.name          AS rest_name,
  r.cuisine,
  r.is_active,
  COUNT(o.id)     AS total_orders,
  COALESCE(SUM(o.total_amount), 0) AS total_revenue,
  ROUND(AVG(rat.stars), 1)         AS avg_rating
FROM restaurants r
LEFT JOIN orders  o   ON r.id = o.restaurant_id AND o.status = 'DELIVERED'
LEFT JOIN ratings rat ON r.id = rat.restaurant_id
GROUP BY r.id, r.name, r.cuisine, r.is_active;

-- View 3: Customer order summary
CREATE OR REPLACE VIEW view_customer_summary AS
SELECT
  u.id,
  u.name,
  u.email,
  u.phone,
  u.role,
  COUNT(o.id)                      AS total_orders,
  COALESCE(SUM(o.total_amount), 0) AS total_spent,
  MAX(o.created_at)                AS last_order_at
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email, u.phone, u.role;
