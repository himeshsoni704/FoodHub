# 🍽️ FoodHub — Pro Multi-Restaurant Delivery Platform

FoodHub is a state-of-the-art, full-stack food delivery and management ecosystem. It bridges the gap between customers, restaurant owners, and platform administrators while integrating an **AI-powered Instagram Bot** for seamless automated ordering via social media.

---

## 🌟 Key Features

### 👤 Customer Experience
- **Smart Browsing:** Explore multiple restaurants with real-time menu availability.
- **Dynamic Cart:** Seamlessly add/remove items with single-restaurant enforcement.
- **Social Integration:** Register with your Instagram handle to receive AI-driven order updates.
- **Order Tracking:** Monitor live order statuses from "Placed" to "Delivered".

### 🏪 Seller Dashboard
- **Menu Management:** Full CRUD operations for menu items with instant availability toggles.
- **Revenue Analytics:** Detailed breakdown of earnings and top-selling items.
- **Order Handling:** Real-time order management interface.

### ⚙️ Admin Control
- **Platform Analytics:** Global revenue and order volume tracking.
- **User/Restaurant Management:** Full control over platform entities and statuses.

### 🤖 Instagram AI Bot (`InstaApp.py`)
- **Automated Ordering:** Chat with the AI bot on Instagram to browse the menu and place orders.
- **Natural Language Processing:** Powered by **Groq Llama 3** for human-like conversations.
- **Order Notifications:** Automatically triggers DMs to customers when their order status changes on the web.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Vanilla JavaScript, Modern CSS3 (Glassmorphism), HTML5 |
| **Backend** | PHP 8.x |
| **Database** | MySQL 8.0+ |
| **AI Bot** | Python 3.9+, Groq API, Instagrapi |

---

## 🚀 Installation & Setup

### 1. Database Setup
1. Open your MySQL terminal or phpMyAdmin.
2. Create the database: `CREATE DATABASE foodhub;`
3. Import the schema: `mysql -u root -p foodhub < schema.sql`
   - *Note: This will set up all tables, views, and seed data for testing.*

### 2. Configuration
- **PHP:** Update `php/api/db.php` with your MySQL credentials (Host, Username, Password).
- **Python Bot:** Open `InstaApp.py` and configure:
  - `INSTAGRAM_USERNAME` & `INSTAGRAM_PASSWORD`
  - `GROQ_API_KEY`
  - Database credentials in the `db` connection block.

---

## 💻 How to Run

### 🐧 On Linux (Fedora/Ubuntu/etc.)
1. **Move to Web Root:**
   ```bash
   sudo cp -r foodHUb /var/www/html/
   sudo chown -R apache:apache /var/www/html/foodHUb  # Use 'www-data' for Ubuntu
   ```
2. **Start Services:**
   ```bash
   sudo systemctl start httpd  # or apache2
   sudo systemctl start mariadb # or mysql
   ```
3. **Run the AI Bot:**
   ```bash
   cd /path/to/foodHUb
   pip install instagrapi requests mysql-connector-python openai
   python3 InstaApp.py
   ```
4. **Access:** Open `http://localhost/foodHUb/`

### 🪟 On Windows (XAMPP/WAMP)
1. **Move to htdocs:**
   Copy the `foodHUb` folder into `C:\xampp\htdocs\`.
2. **Start XAMPP Control Panel:**
   Start **Apache** and **MySQL**.
3. **Run the AI Bot:**
   - Open Command Prompt/PowerShell.
   - Navigate to the folder: `cd C:\xampp\htdocs\foodHUb`
   - Install dependencies: `pip install instagrapi requests mysql-connector-python openai`
   - Run: `python InstaApp.py`
4. **Access:** Open `http://localhost/foodHUb/` in your browser.

---

## 🧪 Demo Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Customer** | `rahul@email.com` | `password123` |
| **Seller** | `ravi@seller.com` | `password123` |
| **Admin** | `admin@food.com` | `password123` |

---

## 🤖 Instagram Notification Engine

FoodHub features a unique Python-PHP bridge to provide real-time order updates via Instagram DMs.

### Workflow:
1.  **Event:** Order status changes (e.g., `CONFIRMED` → `OUT_FOR_DELIVERY`) in the PHP dashboard.
2.  **Trigger:** `order.php` calls `send_instagram.php`.
3.  **Handoff:** PHP executes `python3 InstaApp.py <handle> <message>` in the background.
4.  **Delivery:** The Python bot logs in and sends the DM to the customer's Instagram handle.

### Prerequisites for DMs:
*   Users must provide their Instagram handle during registration.
*   The web server user (`apache` or `www-data`) must have permissions to execute `python3`.
*   Python dependencies must be installed globally:
    ```bash
    sudo pip install instagrapi requests mysql-connector-python openai
    ```

---

## 🛠 Troubleshooting & FAQs

*   **Notifications not appearing?** Ensure `is_read` exists in the `notifications` table and check `php/api/notifications.php` for syntax errors.
*   **Instagram Login Failed?** If Instagram triggers a security challenge, log in to the bot account in a web browser on the same machine to solve it.
*   **Revenue shows ₹0?** Ensure you have created the required Database Views (`view_order_details`, etc.) from the bottom of `schema.sql`.

---

## 📜 License
Developed as a Full-Stack DBMS Semester Project. All rights reserved.
