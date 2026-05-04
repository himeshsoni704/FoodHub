import time
import requests
from instagrapi import Client
from openai import OpenAI
import json
import mysql.connector
from pathlib import Path

# ─── CONFIG ──────────────────────────────────────────────────
INSTAGRAM_USERNAME = "cow.1156"
INSTAGRAM_PASSWORD = "cowX123#"
GROQ_API_KEY = "------------"
SESSION_FILE = Path(__file__).parent / "instagram_session.json"

# ─── DB CONNECTION (Unified with FoodHub) ───────────────────
db = mysql.connector.connect(
    host="127.0.0.1",
    user="root",
    password="IcKh@1201",
    database="foodhub"
)
cursor = db.cursor(dictionary=True)

def load_menu():
    # Load from FoodHub menu_items table
    cursor.execute("SELECT id, name, price, category FROM menu_items WHERE available=1")
    rows = cursor.fetchall()
    return [{"id": r["id"], "name": r["name"], "price": float(r["price"]), "category": r["category"]} for r in rows]

def save_order(insta_username, state):
    # 1. Find user_id from user_socials
    cursor.execute("SELECT user_id FROM user_socials WHERE handle = %s AND platform = 'instagram'", (insta_username,))
    user_row = cursor.fetchone()
    
    if user_row:
        user_id = user_row['user_id']
    else:
        # Create a "Guest" user or handle as needed. For now, let's assume users are pre-registered
        # or use a default guest user ID (e.g., 1)
        user_id = 1 

    # 2. Insert into orders table
    # Default to restaurant_id 1 (Spice Garden) for Instagram orders, or logic to detect restaurant
    restaurant_id = 1 
    
    # Calculate total amount
    total_amount = 0
    menu = load_menu()
    items_to_save = []
    
    for ordered_item in state["items"]:
        # Find matching menu item to get the real price and ID
        match = next((m for m in menu if m['name'].lower() == ordered_item['name'].lower()), None)
        if match:
            qty = int(ordered_item.get('quantity', 1))
            price = match['price']
            total_amount += price * qty
            items_to_save.append({
                "menu_item_id": match['id'],
                "quantity": qty,
                "price": price
            })

    if not items_to_save:
        return None

    cursor.execute(
        "INSERT INTO orders (user_id, restaurant_id, total_amount, status) VALUES (%s, %s, %s, 'PLACED')",
        (user_id, restaurant_id, total_amount)
    )
    order_id = cursor.lastrowid

    # 3. Insert into order_items
    for item in items_to_save:
        cursor.execute(
            "INSERT INTO order_items (order_id, menu_item_id, quantity, price) VALUES (%s, %s, %s, %s)",
            (order_id, item['menu_item_id'], item['quantity'], item['price'])
        )
    
    # 4. Add a notification for the user
    msg = f"Instagram Order #{order_id} received! Our team is preparing your {len(items_to_save)} items."
    cursor.execute("INSERT INTO notifications (user_id, message) VALUES (%s, %s)", (user_id, msg))
    
    db.commit()
    return order_id

# ─── GROQ CLIENT ─────────────────────────────────────────────
groq = OpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)

MODEL = "llama-3.3-70b-versatile"

def build_system_prompt(menu):
    menu_text = "\n".join(
        f"- {item['name']} ({item['category']}) | Price: ₹{item['price']}"
        for item in menu
    )
    return f"""You are a friendly Instagram food ordering assistant for FoodHub.
Keep replies SHORT (max 2 sentences) — this is Instagram DM.

MENU:
{menu_text}

Rules:
- Only accept items from the menu
- If item not on menu, say unavailable and suggest closest alternative
- NEVER re-ask for info already given
- Ask ONLY ONE question at a time
- Collect: items (name, quantity), delivery address
- Payment is currently Cash on Delivery only for Instagram orders.
- Once complete, confirm the order with total price

Always respond ONLY in this JSON format:
{{
  "reply": "short Instagram-style reply here",
  "extracted": {{
    "items": [{{"name": "...", "quantity": 1}}],
    "address": "..."
  }}
}}
Only include fields in "extracted" that were just mentioned. Use null for fields not mentioned."""

def get_missing(state):
    missing = []
    if not state["items"]:
        missing.append("items (name, quantity)")
    if not state["address"]:
        missing.append("delivery address")
    return missing

def update_state(state, extracted):
    if extracted.get("items"):
        for new_item in extracted["items"]:
            exists = any(
                i.get("name", "").lower() == new_item.get("name", "").lower()
                for i in state["items"]
            )
            if not exists:
                state["items"].append(new_item)
            else:
                for i in state["items"]:
                    if i.get("name", "").lower() == new_item.get("name", "").lower():
                        if new_item.get("quantity"): i["quantity"] = new_item["quantity"]
    if extracted.get("address"):
        state["address"] = extracted["address"]
    return state

def clean_reply(text):
    if "{" in text:
        text = text[:text.index("{")].strip()
    return text.strip()

def process_message(user_input, history, state, system_prompt):
    history.append({"role": "user", "content": user_input})

    messages = [{"role": "system", "content": system_prompt}]
    messages += history
    messages.append({
        "role": "system",
        "content": f"Current order: {json.dumps(state)}\nStill missing: {get_missing(state)}"
    })

    try:
        response = groq.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.4,
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        parsed    = json.loads(raw)
        reply     = parsed.get("reply", "Got it 👍")
        extracted = parsed.get("extracted", {})

        if extracted:
            state = update_state(state, extracted)

        reply = clean_reply(reply)
        history.append({"role": "assistant", "content": reply})
        is_complete = len(get_missing(state)) == 0
        return reply, history, state, is_complete

    except json.JSONDecodeError:
        try:
            parsed = json.loads(raw)
            reply  = clean_reply(parsed.get("reply", raw))
        except:
            reply  = clean_reply(raw)
        history.append({"role": "assistant", "content": reply})
        return reply, history, state, False

    except Exception as e:
        err = f"Sorry, something went wrong: {e}"
        return err, history, state, False

def analyze_media(url, media_type="image"):
    try:
        response = groq.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": f"Someone sent a {media_type} on Instagram related to food. "
                           f"Give a very short (max 5 words), friendly reaction as a food delivery assistant."
            }],
            temperature=0.7,
        )
        return clean_reply(response.choices[0].message.content.strip())
    except Exception as e:
        print(f"Media analysis error: {e}")
        return "Looks delicious! 😍"

def instagram_login():
    cl = Client()
    if SESSION_FILE.exists():
        try:
            cl.load_settings(SESSION_FILE)
            cl.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
            cl.get_timeline_feed()
            print(f"✅ Logged in via saved session as {INSTAGRAM_USERNAME}")
            return cl
        except Exception as e:
            print(f"⚠️ Saved session invalid ({e}), logging in fresh...")
            SESSION_FILE.unlink(missing_ok=True)
    try:
        cl.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
        cl.dump_settings(SESSION_FILE)
        print(f"✅ Fresh login successful, session saved to {SESSION_FILE}")
        return cl
    except Exception as e:
        print(f"❌ Instagram login failed: {e}")
        return None

def run_instagram_bot(menu, system_prompt):
    cl = instagram_login()
    if not cl:
        return

    user_sessions    = {}
    thread_last_seen = {}

    print("\n📱 Listening for Instagram DMs...\n")

    while True:
        try:
            threads = cl.direct_threads()
            for thread in threads:
                if not thread.messages: continue
                msg       = thread.messages[0]
                thread_id = thread.id
                if thread_last_seen.get(thread_id) == msg.id: continue

                user_id  = str(msg.user_id)
                username = cl.user_info(msg.user_id).username
                if username == INSTAGRAM_USERNAME:
                    thread_last_seen[thread_id] = msg.id
                    continue

                print(f"📩 [{username}] {msg.text or 'MEDIA'}")
                if user_id not in user_sessions:
                    user_sessions[user_id] = {
                        "history": [],
                        "state":   {"items": [], "address": None}
                    }

                session = user_sessions[user_id]
                if msg.text:
                    reply, session["history"], session["state"], is_complete = process_message(
                        msg.text, session["history"], session["state"], system_prompt
                    )
                    cl.direct_send(reply, [msg.user_id])
                    print(f"🤖 [{username}] {reply}")

                    if is_complete:
                        order_id = save_order(username, session["state"])
                        if order_id:
                            confirm  = f"✅ Order #{order_id} placed! We'll deliver to {session['state']['address']} soon 🛵"
                            cl.direct_send(confirm, [msg.user_id])
                            print(f"✅ Order #{order_id} saved for {username}")
                        del user_sessions[user_id]
                else:
                    media_to_process = []
                    if msg.media: media_to_process = msg.media if isinstance(msg.media, list) else [msg.media]
                    if hasattr(msg, "media_share") and msg.media_share: media_to_process.append(msg.media_share)
                    for m in media_to_process:
                        url = getattr(m, "thumbnail_url", getattr(m, "url", None))
                        if url:
                            mt             = getattr(m, "media_type", 1)
                            media_type_str = "image" if mt == 1 else "video"
                            reaction       = analyze_media(url, media_type_str)
                            cl.direct_send(reaction, [msg.user_id])
                            print(f"🖼️ [{username}] Media reaction: {reaction}")

                thread_last_seen[thread_id] = msg.id
        except Exception as e:
            err_msg = str(e).lower()
            # Catching "challenge", "checkpoint", or the common 404/challenge pattern
            if any(x in err_msg for x in ["challenge", "checkpoint", "404", "login_required"]):
                print(f"❌ Instagram Challenge/Auth Error: {e}")
                print("⚠️  The account requires manual verification or has been flagged.")
                print("💡  FIX: Log in to @cow.1156 via a web browser, solve the prompt, then restart.")
                print("⌛  Backing off for 5 minutes...")
                time.sleep(300) 
            else:
                print(f"⚠️ Loop error: {e}")
                time.sleep(10) 
        
        time.sleep(5) # Standard poll interval

if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 3:
        # ── CLI MODE (called from send_instagram.php) ──────────────────
        # Usage: python3 InstaApp.py <instagram_handle> <message>
        target_handle = sys.argv[1].replace('@', '')  # Strip @ if present
        dm_message    = sys.argv[2]

        cl = instagram_login()
        if cl:
            try:
                target_user_id = cl.user_id_from_username(target_handle)
                cl.direct_send(dm_message, [target_user_id])
                print(f"✅ DM sent to @{target_handle}: {dm_message}")
            except Exception as e:
                error_msg = f"❌ Failed to send DM to @{target_handle}: {e}"
                print(error_msg)
                # Log to the same debug log PHP uses if possible
                log_file = SESSION_FILE.parent / "php/api/instagram_debug.log"
                if log_file.parent.exists():
                    with open(log_file, "a") as f:
                        f.write(f"[{time.ctime()}] {error_msg}\n")
        else:
            print("❌ Instagram login failed — DM not sent.")
    else:
        # ── BOT LOOP MODE (run manually) ───────────────────────────────
        menu          = load_menu()
        system_prompt = build_system_prompt(menu)
        run_instagram_bot(menu, system_prompt)