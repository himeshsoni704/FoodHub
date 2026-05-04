/* ═══════════════════════════════════════════
   API CONFIG  — all PHP files are at php/api/
   Your DB schema has ONLY these columns:
     users:       id, name, email, password_hash, role, phone, created_at
     restaurants: id, name, cuisine, is_active
     menu_items:  id, restaurant_id, name, category, description, price, stock
     orders:      id, user_id, restaurant_id, total_amount, status, created_at
     order_items: id, order_id, menu_item_id, quantity, price
     notifications: id, user_id, message, is_read, created_at
═══════════════════════════════════════════ */

const API_BASE = 'php/api';

async function apiFetch(file, params = {}, method = 'GET', body = null) {
  let url = `${API_BASE}/${file}`;
  if (method === 'GET' && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    if (!res.ok) { console.error('HTTP', res.status, url); return null; }
    return await res.json();
  } catch (e) {
    console.error('apiFetch error', url, e);
    return null;
  }
}

/* ═══════════════════════════════════════════
   APP STATE
═══════════════════════════════════════════ */
const S = {
  role: 'customer',
  user: null,
  page: 'home',
  selectedRest: null,
  trackOrder: null,
  cart: {},
  promoApplied: null,
  deliveryAddr: '',
  ratingVal: 0,
  ratingRest: 1,
  sellerRestId: null,
  editItemId: null,
  notifOpen: false,
  confirmedOrder: null,
  restaurants: [],
  menus: {},
  orders: [],
  users: [],
  notifications: [],
};

/* ═══════════════════════════════════════════
   NAV
═══════════════════════════════════════════ */
const NAV = {
  customer: [
    { label: 'Home',        p: 'home',        icon: '🏠' },
    { label: 'Restaurants', p: 'restaurants', icon: '🍽️' },
    { label: 'Cart',        p: 'cart',        icon: '🛒', cart: true },
    { label: 'My Orders',   p: 'orders',      icon: '📦' },
    { label: 'Track Order', p: 'track',       icon: '📍' },
    { label: 'Ratings',     p: 'ratings',     icon: '⭐' },
    { label: 'Profile',     p: 'profile',     icon: '👤' },
  ],
  seller: [
    { label: 'Dashboard',  p: 's-dash',     icon: '📊' },
    { label: 'Orders',     p: 's-orders',   icon: '📋' },
    { label: 'Menu CRUD',  p: 's-menu',     icon: '🍴' },
    { label: 'Revenue',    p: 's-revenue',  icon: '💰' },
    { label: 'Top Items',  p: 's-topitems', icon: '🔥' },
    { label: 'Profile',    p: 'profile',    icon: '👤' },
  ],
  admin: [
    { label: 'Dashboard',   p: 'a-dash',        icon: '📊' },
    { label: 'Users',       p: 'a-users',       icon: '👥' },
    { label: 'Restaurants', p: 'a-restaurants', icon: '🏪' },
    { label: 'Orders',      p: 'a-orders',      icon: '📦' },
    { label: 'Analytics',   p: 'a-analytics',   icon: '📈' },
    { label: 'Profile',     p: 'profile',       icon: '👤' },
  ],
};

const PAGE_NAMES = {
  home:'Home', restaurants:'Restaurants', menu:'Menu', cart:'My Cart',
  orders:'My Orders', track:'Order Tracking', ratings:'Ratings',
  profile:'My Profile', 'order-confirm':'Order Confirmed',
  's-dash':'Dashboard','s-orders':'Order Management','s-menu':'Menu Management',
  's-revenue':'Revenue Analytics','s-topitems':'Top Selling Items',
  'a-dash':'Platform Dashboard','a-users':'User Management',
  'a-restaurants':'Restaurant Management','a-orders':'All Orders','a-analytics':'Analytics',
};

/* ═══════════════════════════════════════════
   ROUTING
═══════════════════════════════════════════ */
async function goto(p) {
  S.page = p;
  document.getElementById('topTitle').textContent = PAGE_NAMES[p] || 'FoodHub';
  document.querySelectorAll('.sb-item').forEach(el => el.classList.toggle('active', el.dataset.p === p));
  updateCartBadge();
  loadNotifications(); // Refresh bell icon on every page change
  const wrap = document.getElementById('pageWrap');
  wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Loading…</div>';
  wrap.innerHTML = PAGES[p] ? await PAGES[p]() :
    `<div class="empty"><div class="empty-ico">🔍</div><div class="empty-title">Page not found</div></div>`;
  window.scrollTo(0,0);
}

function buildSidebar() {
  const items = NAV[S.role] || [];
  let html = `<div class="sb-section">${{customer:'Customer',seller:'Seller Panel',admin:'Admin Panel'}[S.role]}</div>`;
  items.forEach(it => {
    const badge = it.cart && cartCount() > 0 ? `<span class="sb-badge">${cartCount()}</span>` : '';
    html += `<div class="sb-item${S.page===it.p?' active':''}" data-p="${it.p}" onclick="goto('${it.p}')">
      <span class="sb-icon">${it.icon}</span>${it.label}${badge}</div>`;
  });
  document.getElementById('sbNav').innerHTML = html;
  const av = S.user.name ? S.user.name[0].toUpperCase() : '?';
  document.getElementById('sbName').textContent = S.user.name;
  document.getElementById('sbRole').textContent = S.role.charAt(0).toUpperCase() + S.role.slice(1);
  document.getElementById('sbAvatar').textContent = av;
  document.getElementById('topAvatar').textContent = av;
}

function updateCartBadge() {
  document.querySelectorAll('.sb-badge').forEach(el => el.remove());
  document.querySelectorAll('.sb-item[data-p="cart"]').forEach(el => {
    if (cartCount() > 0) el.innerHTML += `<span class="sb-badge">${cartCount()}</span>`;
  });
  const fc = document.getElementById('floatCart');
  if (fc) {
    fc.classList.toggle('visible', cartCount() > 0);
    const cn = document.getElementById('fcN'), ct = document.getElementById('fcT');
    if (cn) cn.textContent = cartCount();
    if (ct) ct.textContent = `₹${cartTotal()}`;
  }
}

/* ═══════════════════════════════════════════
   NOTIFICATIONS
   notifications.php returns: { id, text, time, is_read, color }
   (field mapping done in PHP so JS just uses them directly)
═══════════════════════════════════════════ */
async function loadNotifications() {
  if (!S.user) return;
  console.log('Fetching notifications for user:', S.user.id);
  const data = await apiFetch('notifications.php', { user_id: S.user.id });
  S.notifications = data || [];
  console.log('Notifications received:', S.notifications.length);
  buildNotifPanel();
}

function buildNotifPanel() {
  const allNotifs = S.notifications;
  const unreadNotifs = allNotifs.filter(n => !n.is_read);
  const unreadCount = unreadNotifs.length;
  
  const nc = document.getElementById('notifCount');
  if (unreadCount > 0) { 
    nc.textContent = unreadCount; 
    nc.style.display = 'flex'; 
  } else { 
    nc.style.display = 'none'; 
  }

  const list = document.getElementById('notifList');
  if (unreadCount === 0) {
    list.innerHTML = '<div class="tm tsm p20" style="text-align:center">No new notifications</div>';
    return;
  }

  list.innerHTML = unreadNotifs.map(n => `
    <div class="notif-item unread" onclick="readNotif(${n.id})">
      <div class="notif-dot" style="background:var(--orange);margin-top:5px;flex-shrink:0"></div>
      <div style="flex:1"><div class="notif-text">${n.text}</div><div class="notif-time">${n.time}</div></div>
    </div>`).join('');
}

function toggleNotif() {
  S.notifOpen = !S.notifOpen;
  document.getElementById('notifPanel').classList.toggle('open', S.notifOpen);
}
async function readNotif(id) {
  const n = S.notifications.find(x => x.id === id);
  if (n && !n.is_read) {
    n.is_read = 1;
    await apiFetch('notifications.php', {}, 'POST', { notification_id: id });
    buildNotifPanel();
  }
}
async function markAllRead() {
  S.notifications.forEach(n => n.is_read = 1);
  await apiFetch('notifications.php', {}, 'POST', { all: true, user_id: S.user.id });
  buildNotifPanel(); closeNotif();
  toast('All notifications marked as read');
}
function closeNotif() { S.notifOpen = false; document.getElementById('notifPanel').classList.remove('open'); }
document.addEventListener('click', e => {
  const nb = document.getElementById('notifBtn'), np = document.getElementById('notifPanel');
  if (nb && np && !nb.contains(e.target) && !np.contains(e.target)) closeNotif();
});

/* ═══════════════════════════════════════════
   AUTH
   login.php: POST { email, password } → user row (no password_hash)
              Returns { error: "…" } on failure
═══════════════════════════════════════════ */
function pickRole(r, el) {
  S.role = r;
  document.querySelectorAll('#authScreen .role-opt').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  // Hide signup link for admin
  const signupLink = document.getElementById('authSignupLink');
  if (signupLink) signupLink.style.display = (r === 'admin') ? 'none' : '';
}

let signupRole = 'customer';

function showSignup() {
  signupRole = S.role || 'customer';
  pickSignupRole(signupRole);
  document.getElementById('signupOverlay').classList.add('open');
}

function pickSignupRole(role) {
  signupRole = role;
  document.querySelectorAll('#signupOverlay .role-opt').forEach(el => el.classList.remove('active'));
  document.getElementById('su-role-' + role)?.classList.add('active');
}

async function doSignup() {
  const name  = document.getElementById('su-name').value.trim();
  const phone = document.getElementById('su-phone').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pass  = document.getElementById('su-pass').value;
  const pass2 = document.getElementById('su-pass2').value;
  const insta = document.getElementById('su-insta')?.value.trim().replace(/^@/, '') || '';

  if (!name || !email || !pass) { toast('Name, email and password are required'); return; }
  if (pass.length < 6) { toast('Password must be at least 6 characters'); return; }
  if (pass !== pass2) { toast('Passwords do not match ✕'); return; }

  const btn = document.querySelector('#signupOverlay .btn-primary');
  if (btn) { btn.textContent = 'Creating account…'; btn.disabled = true; }

  const result = await apiFetch('login.php', {}, 'POST', {
    action: 'register', name, email, password: pass, phone, role: signupRole, instagram_id: insta
  });

  if (btn) { btn.textContent = 'Create Account'; btn.disabled = false; }

  if (!result || result.error) {
    toast(result?.error || 'Registration failed ✕'); return;
  }

  // Clear form
  ['su-name','su-phone','su-email','su-pass','su-pass2','su-insta'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  closeOverlay('signupOverlay');

  // Auto-login — PHP now returns the full user row
  S.user = result;
  S.role = result.role || signupRole || 'customer';
  S.deliveryAddr = result.address || '';

  if (S.role === 'seller') {
    const rests = await apiFetch('restaurants.php');
    S.restaurants = rests || [];
    S.sellerRestId = S.restaurants[0]?.id || 1;
  }

  document.getElementById('authScreen').classList.add('off');
  document.getElementById('appShell').classList.add('show');
  document.getElementById('topDate').textContent = new Date().toLocaleDateString('en-IN',
    { weekday:'short', day:'numeric', month:'short' });

  buildSidebar();
  await loadNotifications();
  await goto({ customer:'home', seller:'s-dash', admin:'a-dash' }[S.role] || 'home');
  toast(`Welcome to FoodHub, ${S.user.name}! 🎉`);
}

async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPass').value;
  if (!email || !pass) { toast('Enter email and password'); return; }

  const user = await apiFetch('login.php', {}, 'POST', { email, password: pass });

  if (!user || user.error) {
    toast(user?.error || 'Invalid credentials ✕');
    return;
  }

  // Ensure role matches what was selected in UI
  if (user.role !== S.role) {
    toast(`Access Denied: This account is a ${user.role}, not an ${S.role}.`);
    return;
  }

  S.user = user;
  S.role = user.role;
  S.deliveryAddr = user.address || '';

  if (S.role === 'seller') {
    const rests = await apiFetch('restaurants.php');
    S.restaurants = rests || [];
    // Seller owns whichever restaurant was seeded for them — default to first
    S.sellerRestId = S.restaurants[0]?.id || 1;
  }

  document.getElementById('authScreen').classList.add('off');
  document.getElementById('appShell').classList.add('show');
  document.getElementById('topDate').textContent = new Date().toLocaleDateString('en-IN',
    { weekday:'short', day:'numeric', month:'short' });

  buildSidebar();
  await loadNotifications();
  await goto({ customer:'home', seller:'s-dash', admin:'a-dash' }[S.role]);
  toast(`Welcome, ${S.user.name}! 👋`);
}

async function doLogout() {
  S.cart={}; S.page='home'; S.promoApplied=null; S.user=null;
  document.getElementById('appShell').classList.remove('show');
  document.getElementById('authScreen').classList.remove('off');
  toast('Logged out successfully');
}

/* ═══════════════════════════════════════════
   CART  (client-side; sent to order.php on checkout)
═══════════════════════════════════════════ */
function cartCount() { return Object.values(S.cart).reduce((a,b) => a+b.qty, 0); }
function cartTotal() { return Object.values(S.cart).reduce((a,b) => a+b.qty*b.item.price, 0); }
function cartSubtotal() { return cartTotal(); }

function addToCart(itemId, restId) {
  const item = (S.menus[restId] || []).find(i => i.id == itemId);
  if (!item) return;
  // Single-restaurant cart enforcement
  const existingRestId = Object.values(S.cart)[0]?.item?.restaurant_id;
  if (existingRestId && existingRestId != restId) {
    toast('Clear cart first to order from a different restaurant');
    return;
  }
  if (!S.cart[itemId]) S.cart[itemId] = { item, qty: 0 };
  S.cart[itemId].qty++;
  updateCartBadge();
  toast(`${item.name} added to cart 🛒`);
  const el = document.querySelector(`[data-qid="${itemId}"]`);
  if (el) el.textContent = S.cart[itemId].qty;
  updateFloatCart();
}

function removeFromCart(itemId) {
  if (!S.cart[itemId]) return;
  S.cart[itemId].qty--;
  if (S.cart[itemId].qty <= 0) delete S.cart[itemId];
  updateCartBadge(); updateFloatCart();
  const el = document.querySelector(`[data-qid="${itemId}"]`);
  if (el) el.textContent = S.cart[itemId]?.qty || 0;
  if (S.page === 'cart') goto('cart');
}

function changeQty(itemId, d) {
  if (!S.cart[itemId]) return;
  S.cart[itemId].qty += d;
  if (S.cart[itemId].qty <= 0) delete S.cart[itemId];
  updateCartBadge(); goto('cart');
}

function updateFloatCart() {
  const fc = document.getElementById('floatCart');
  if (!fc) return;
  fc.classList.toggle('visible', cartCount() > 0);
  const cn = document.getElementById('fcN'), ct = document.getElementById('fcT');
  if (cn) cn.textContent = cartCount();
  if (ct) ct.textContent = `₹${cartTotal()}`;
}

// Promo codes validated locally (no PHP endpoint needed)
const PROMOS = {
  WELCOME20: { label:'20% off (max ₹100)', disc:100 },
  FLAT50:    { label:'Flat ₹50 off',       disc:50  },
  SAVE10:    { label:'₹10 off',             disc:10  },
};
async function applyPromo() {
  const code = document.getElementById('promoInput')?.value?.trim()?.toUpperCase();
  if (!code) { toast('Enter a promo code'); return; }
  const p = PROMOS[code];
  if (p) { S.promoApplied = { code, ...p }; toast(`Promo applied: ${p.label} ✓`); goto('cart'); }
  else    toast('Invalid promo code ✕');
}
function removePromo() { S.promoApplied = null; goto('cart'); toast('Promo removed'); }

function calcOrderTotal() {
  const sub = cartSubtotal(), del = 40, tax = Math.round(sub * 0.05);
  const disc = S.promoApplied ? Number(S.promoApplied.disc) : 0;
  return sub + del + tax - disc;
}

/* ═══════════════════════════════════════════
   PLACE ORDER
   order.php POST body: { customer_id, rest_id, total_amount,
     items: [{ id, name, qty, price }] }
   Returns: { status:'success', order_id:'ORD-X' }
═══════════════════════════════════════════ */
async function placeOrder() {
  const items = Object.values(S.cart);
  if (!items.length) { toast('Cart is empty'); return; }

  const restId = items[0].item.restaurant_id;
  const rest   = S.restaurants.find(r => r.id == restId) || { name:'Restaurant' };
  const total  = calcOrderTotal();

  const payload = {
    customer_id:  S.user.id,
    rest_id:      restId,
    total_amount: total,
    items: items.map(ci => ({ id:ci.item.id, name:ci.item.name, qty:ci.qty, price:ci.item.price })),
  };

  toast('Placing order…');
  const data = await apiFetch('order.php', {}, 'POST', payload);

  if (!data || data.error) { toast(data?.error || 'Order failed, please try again'); return; }

  S.confirmedOrder = {
    id:     data.order_id,
    rest:   rest.name,
    items:  items.map(ci => `${ci.item.name} ×${ci.qty}`).join(', '),
    amt:    total,
    time:   new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }),
    status: 'PLACED',
  };
  S.trackOrder   = data.order_id;
  S.cart         = {};
  S.promoApplied = null;
  updateCartBadge();
  await goto('order-confirm');
}

/* ═══════════════════════════════════════════
   MODALS
═══════════════════════════════════════════ */
function openOverlay(id)  { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }

function saveAddress() {
  S.deliveryAddr = `${document.getElementById('addr-street').value}, ${document.getElementById('addr-city').value} – ${document.getElementById('addr-pin').value}`;
  closeOverlay('addrOverlay'); toast('Address saved ✓');
  if (S.page === 'cart') goto('cart');
}

/* ─── Menu Item CRUD (seller) ───
   restaurants.php POST: { action, rest_id/id, fields… }
   menu.php        GET:  ?rest_id=X
*/
async function saveMenuItem() {
  const name = document.getElementById('mi-name').value.trim();
  if (!name) { toast('Item name is required'); return; }
  const price = parseFloat(document.getElementById('mi-price').value) || 0;
  const stock = parseInt(document.getElementById('mi-stock').value)   || 0;
  const cat   = document.getElementById('mi-cat').value   || 'General';
  const desc  = document.getElementById('mi-desc').value  || '';

  if (S.editItemId) {
    await apiFetch('restaurants.php', {}, 'POST',
      { action:'update_item', id:S.editItemId, name, category:cat, price, stock, description:desc });
    toast(`"${name}" updated ✓`);
  } else {
    await apiFetch('restaurants.php', {}, 'POST',
      { action:'add_item', rest_id:S.sellerRestId, name, category:cat, price, stock, description:desc });
    toast(`"${name}" added to menu ✓`);
  }
  S.editItemId = null;
  document.getElementById('addItemTitle').textContent = 'Add Menu Item';
  closeOverlay('addItemOverlay');
  S.menus[S.sellerRestId] = await apiFetch('menu.php', { rest_id:S.sellerRestId }) || [];
  goto('s-menu');
}

async function editItem(id) {
  const item = (S.menus[S.sellerRestId] || []).find(i => i.id == id);
  if (!item) return;
  S.editItemId = id;
  document.getElementById('addItemTitle').textContent = 'Edit Menu Item';
  document.getElementById('mi-name').value  = item.name;
  document.getElementById('mi-cat').value   = item.category;
  document.getElementById('mi-price').value = item.price;
  document.getElementById('mi-stock').value = item.stock;
  document.getElementById('mi-desc').value  = item.description || '';
  openOverlay('addItemOverlay');
}

async function deleteItem(id) {
  await apiFetch('restaurants.php', {}, 'POST', { action:'delete_item', id });
  toast('Item removed from menu');
  S.menus[S.sellerRestId] = await apiFetch('menu.php', { rest_id:S.sellerRestId }) || [];
  goto('s-menu');
}

async function toggleItemAvail(id) {
  const item = (S.menus[S.sellerRestId] || []).find(i => i.id == id);
  if (!item) return;
  const newVal = item.available == 1 ? 0 : 1;
  await apiFetch('restaurants.php', {}, 'POST', { action:'toggle_item', id, available:newVal });
  item.available = newVal;
  toast(`${item.name} marked ${newVal ? 'available' : 'unavailable'}`);
  goto('s-menu');
}

/* ═══════════════════════════════════════════
   RATINGS
═══════════════════════════════════════════ */
function setRating(v) {
  S.ratingVal = v;
  for (let i=1; i<=5; i++) {
    const el = document.getElementById(`st${i}`);
    if (el) el.className = 'star' + (i<=v?' on':'');
  }
  const lbl = document.getElementById('ratingLbl');
  if (lbl) lbl.textContent = ['','Poor','Fair','Good','Very Good','Excellent'][v] || '';
}

async function submitRating() {
  if (!S.ratingVal) { toast('Please select a rating'); return; }
  const restId  = document.querySelector('#ratingRestSel')?.value;
  const orderId = document.querySelector('#ratingOrderSel')?.value || null;
  const comment = document.getElementById('rvText')?.value || '';
  await apiFetch('order.php', {}, 'POST', {
    action:'add_rating', customer_id:S.user.id,
    restaurant_id:restId||S.ratingRest, order_id:orderId,
    stars:S.ratingVal, comment,
  });
  toast('Review submitted! Thank you 🙏');
  S.ratingVal = 0; goto('ratings');
}

/* ═══════════════════════════════════════════
   ADMIN ACTIONS
═══════════════════════════════════════════ */
async function toggleRestaurant(id) {
  const r = S.restaurants.find(x => x.id == id);
  if (!r) return;
  const newVal = r.active == 1 ? 0 : 1;
  await apiFetch('restaurants.php', {}, 'POST', { action:'toggle_status', id, active:newVal });
  r.active = newVal; r.is_active = newVal;
  toast(`${r.name} ${newVal ? 'activated' : 'deactivated'}`);
  goto('a-restaurants');
}

async function updateOrderStatus(orderId, status) {
  if (!status) return;
  await apiFetch('order.php', {}, 'POST', { action:'update_status', order_id:orderId, status });
  const o = S.orders.find(x => x.id === orderId);
  if (o) o.status = status;
  toast(`Order ${orderId} → ${status.replace(/_/g,' ')} ✓`);
  if (S.page==='s-orders'||S.page==='a-orders') goto(S.page);
}

async function deleteUser(id) {
  await apiFetch('login.php', {}, 'POST', { action:'delete_user', id });
  S.users = S.users.filter(u => u.id != id);
  toast('User deleted'); goto('a-users');
}

/* ═══════════════════════════════════════════
   PROFILE SAVE
═══════════════════════════════════════════ */
async function saveProfile() {
  const name  = document.getElementById('pf-name')?.value  || S.user.name;
  const phone = document.getElementById('pf-phone')?.value || S.user.phone;
  const insta = document.getElementById('pf-insta')?.value || '';
  await apiFetch('login.php', {}, 'POST',
    { action:'update_profile', id:S.user.id, name, phone, instagram_id:insta });
  S.user.name = name; S.user.phone = phone; S.user.instagram_id = insta;
  document.getElementById('sbName').textContent = name;
  toast('Profile updated ✓');
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function sp(status) {
  const map = { PLACED:'sp-placed', CONFIRMED:'sp-confirmed', PREPARING:'sp-preparing',
                OUT_FOR_DELIVERY:'sp-out', DELIVERED:'sp-delivered', CANCELLED:'sp-cancelled' };
  return `<span class="sp ${map[status]||''}">${status.replace(/_/g,' ')}</span>`;
}
let _toast;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_toast); _toast = setTimeout(() => el.classList.remove('on'), 2500);
}
function filterRests(q) {
  document.querySelectorAll('.rest-card').forEach(c => {
    c.style.display = ((c.dataset.n||'').includes(q.toLowerCase())
                    || (c.dataset.cu||'').includes(q.toLowerCase())) ? '' : 'none';
  });
}
function filterCuisine(c, el) {
  document.querySelectorAll('.chip').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.rest-card').forEach(card => {
    card.style.display = (c==='All'||card.dataset.cu===c) ? '' : 'none';
  });
}
function filterMenu(cat, el) {
  document.querySelectorAll('.chip').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.menu-card').forEach(card => {
    card.style.display = (cat==='All'||card.dataset.cat===cat) ? '' : 'none';
  });
}
function filterUsers(role, el) {
  document.querySelectorAll('.chip').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('tr[data-role]').forEach(row => {
    row.style.display = (role==='all'||row.dataset.role===role) ? '' : 'none';
  });
}

/* ═══════════════════════════════════════════
   PAGE RENDERERS
═══════════════════════════════════════════ */
const PAGES = {};

/* ─────── CUSTOMER: HOME ─────── */
PAGES['home'] = async () => {
  const [rests, orders] = await Promise.all([
    apiFetch('restaurants.php'),
    apiFetch('order.php', { action:'customer_orders', customer_id:S.user.id }),
    loadNotifications() // Refresh notifications on home load
  ]);
  S.restaurants = rests  || [];
  S.orders      = orders || [];
  const h = new Date().getHours();
  const greet = h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  // restaurants.php adds is_active → active normalisation
  const open = S.restaurants.filter(r => r.active==1);

  return `
<div class="hero">
  <div>
    <div class="hero-greeting">${greet} ☀️</div>
    <div class="hero-title">Hungry, ${S.user.name.split(' ')[0]}?<br>Let's find something great.</div>
    <div class="hero-sub">${open.length} restaurants open near you right now</div>
    <div class="hero-cta"><button class="btn btn-primary" onclick="goto('restaurants')">Browse Restaurants →</button></div>
  </div>
  <div class="hero-img">🍽️</div>
</div>
<div class="kpi-row">
  <div class="kpi" style="--kpi-color:var(--orange)"><span class="kpi-icon">🏪</span><div class="kpi-label">Open Restaurants</div><div class="kpi-value">${open.length}</div><div class="kpi-sub">Available now</div></div>
  <div class="kpi" style="--kpi-color:var(--green)"><span class="kpi-icon">🛒</span><div class="kpi-label">Cart Items</div><div class="kpi-value">${cartCount()}</div><div class="kpi-sub">${cartCount()>0?'<button class="btn btn-xs btn-outline" onclick="goto(\'cart\')">View cart</button>':'Start browsing'}</div></div>
  <div class="kpi" style="--kpi-color:var(--amber)"><span class="kpi-icon">📦</span><div class="kpi-label">My Orders</div><div class="kpi-value">${S.orders.length}</div><div class="kpi-sub">Total placed</div></div>
</div>
<div class="sec-head">
  <div><div class="sec-title">Top Picks For You</div><div class="sec-sub">Open restaurants near you</div></div>
  <button class="btn btn-outline btn-sm" onclick="goto('restaurants')">View all</button>
</div>
<div class="rest-grid">
${open.slice(0,4).map(r => `
  <div class="rest-card" data-n="${r.name.toLowerCase()}" data-cu="${r.cuisine||''}" onclick="S.selectedRest=${r.id};goto('menu')">
    <div class="rest-cover" style="background:var(--orange-bg)"><span>🍽️</span>
      <span class="rest-open-tag" style="background:rgba(234,244,238,.9);color:#2D6047;font-size:10px;font-weight:700;">● Open</span>
    </div>
    <div class="rest-body">
      <div class="rest-name">${r.name}</div>
      <div class="rest-cuisine">${r.cuisine||''}</div>
      <div class="rest-meta"><span>~30 min</span></div>
    </div>
  </div>`).join('')}
</div>
<div class="sec-head mt24">
  <div><div class="sec-title">Recent Orders</div></div>
  <button class="btn btn-outline btn-sm" onclick="goto('orders')">View all</button>
</div>
${S.orders.slice(0,2).map(o => `
  <div class="card mb12">
    <div class="card-body-sm flex fai fjb">
      <div>
        <div class="flex fai gap10"><span class="fw7">${o.id}</span>${sp(o.status)}</div>
        <div class="tm tsm mt4">${o.rest_name} · ${o.items}</div>
        <div class="tm txs mt4">${o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : ''}</div>
      </div>
      <div style="text-align:right">
        <div class="lora fw7" style="font-size:16px;color:var(--orange)">₹${o.amount}</div>
        <div class="flex gap6 mt8">
          <button class="btn btn-xs btn-outline" onclick="S.trackOrder='${o.id}';goto('track')">Track</button>
          <button class="btn btn-xs btn-ghost" onclick="toast('Reorder placed! 🎉')">Reorder</button>
        </div>
      </div>
    </div>
  </div>`).join('') || '<div class="tm tsm" style="padding:8px 0">No orders yet — start browsing!</div>'}`;
};

/* ─────── CUSTOMER: RESTAURANTS ─────── */
PAGES['restaurants'] = async () => {
  const rests = await apiFetch('restaurants.php');
  S.restaurants = rests || [];
  const cuisines = [...new Set(S.restaurants.map(r=>r.cuisine).filter(Boolean))];

  return `
<div class="search-wrap">
  <span class="search-icon">🔍</span>
  <input placeholder="Search restaurants or cuisines…" oninput="filterRests(this.value)"/>
</div>
<div class="chips">
  <div class="chip active" onclick="filterCuisine('All',this)">All</div>
  ${cuisines.map(c=>`<div class="chip" onclick="filterCuisine('${c}',this)">${c}</div>`).join('')}
</div>
<div class="sec-head"><div class="sec-title">All Restaurants <span style="font-size:14px;color:var(--muted);font-weight:400">(${S.restaurants.length})</span></div></div>
<div class="rest-grid">
${S.restaurants.map(r => {
    const active = r.active==1;
    return `<div class="rest-card${!active?' closed':''}" data-n="${r.name.toLowerCase()}" data-cu="${r.cuisine||''}" onclick="S.selectedRest=${r.id};goto('menu')">
    <div class="rest-cover" style="background:${r.bg}"><span>${r.emoji}</span>
      <span class="rest-open-tag" style="background:${active?'rgba(234,244,238,.9)':'rgba(252,234,234,.9)'};color:${active?'#2D6047':'#8B3232'};font-size:10px;font-weight:700;">${active?'● Open':'● Closed'}</span>
    </div>
    <div class="rest-body">
      <div class="flex fjb mb4">
        <div class="rest-name">${r.name}</div>
        <div class="rest-rating">⭐ ${r.rating}</div>
      </div>
      <div class="rest-cuisine">${r.cuisine||''}</div>
      <div class="rest-meta"><span>${r.time}</span></div>
    </div>
  </div>`;}).join('')}
</div>`;
};

/* ─────── CUSTOMER: MENU ─────── */
PAGES['menu'] = async () => {
  if (!S.restaurants.length) S.restaurants = await apiFetch('restaurants.php') || [];
  if (!S.selectedRest) S.selectedRest = S.restaurants[0]?.id;
  const r = S.restaurants.find(x=>x.id==S.selectedRest) || S.restaurants[0];
  if (!r) return '<div class="empty"><div class="empty-ico">🍽️</div><div class="empty-title">Restaurant not found</div></div>';

  // menu.php?rest_id=X  — also sets restaurant_id and available on each item
  const menuItems = await apiFetch('menu.php', { rest_id:r.id });
  S.menus[r.id] = menuItems || [];
  const items = S.menus[r.id];
  const cats  = [...new Set(items.map(i=>i.category).filter(Boolean))];
  const active = r.active==1;

  return `
<button class="btn btn-ghost btn-sm mb16" onclick="goto('restaurants')">← Back</button>
<div class="rest-hero-strip">
  <div class="rest-hero-em">🍽️</div>
  <div style="flex:1">
    <div class="rest-hero-name">${r.name}</div>
    <div class="rest-hero-meta">
      <span>${r.cuisine||''}</span>
      <span class="badge ${active?'badge-green':'badge-red'}">${active?'Open':'Closed'}</span>
    </div>
  </div>
  <button class="btn btn-outline btn-sm" onclick="goto('ratings')">⭐ Reviews</button>
</div>
${!active?'<div class="warn-banner info-banner mb16">⚠️ This restaurant is currently closed. You can still browse the menu.</div>':''}
<div class="chips">
  <div class="chip active" onclick="filterMenu('All',this)">All</div>
  ${cats.map(c=>`<div class="chip" onclick="filterMenu('${c}',this)">${c}</div>`).join('')}
</div>
<div class="menu-grid" id="menuGrid">
${items.map(item => {
    const inCart = S.cart[item.id];
    return `<div class="menu-card" data-cat="${item.category||''}">
    <span class="menu-em">🍽️</span>
    <div class="menu-name">${item.name}</div>
    <div class="menu-desc">${item.description||''}</div>
    <span class="badge badge-muted">${item.category||''}</span>
    <div class="menu-foot" style="margin-top:12px">
      <div class="menu-price">₹${item.price}</div>
      ${inCart&&inCart.qty>0
        ? `<div class="qty-ctrl">
             <button class="qty-btn" onclick="removeFromCart(${item.id})">−</button>
             <span class="qty-n" data-qid="${item.id}">${inCart.qty}</span>
             <button class="qty-btn" onclick="addToCart(${item.id},${r.id})">+</button>
           </div>`
        : `<button class="btn btn-primary btn-xs" onclick="addToCart(${item.id},${r.id})">+ Add</button>`}
    </div>
  </div>`;}).join('')}
</div>
<div id="floatCart" class="float-cart ${cartCount()>0?'visible':''}" onclick="goto('cart')">
  <div class="fc-count" id="fcN">${cartCount()}</div>
  <span>View Cart</span><span class="fc-sep">·</span>
  <span id="fcT">₹${cartTotal()}</span><span>→</span>
</div>`;
};

/* ─────── CUSTOMER: CART ─────── */
PAGES['cart'] = async () => {
  const items = Object.values(S.cart);
  if (!items.length) return `<div class="empty"><div class="empty-ico">🛒</div><div class="empty-title">Your cart is empty</div><div class="empty-desc">Browse restaurants and add some delicious items</div><button class="btn btn-primary" onclick="goto('restaurants')">Browse Restaurants</button></div>`;
  const sub=cartSubtotal(), del=40, tax=Math.round(sub*0.05);
  const disc = S.promoApplied ? Number(S.promoApplied.disc) : 0;
  const total = sub+del+tax-disc;

  return `
<div class="g2-aside">
  <div>
    <div class="card mb16">
      <div class="card-head"><div class="card-title">Order Items</div><span class="badge badge-orange">${cartCount()} items</span></div>
      <div class="card-body">
        ${items.map(ci=>`
          <div class="cart-item">
            <div class="cart-em">🍽️</div>
            <div class="cart-info"><div class="cart-name">${ci.item.name}</div><div class="cart-unit">₹${ci.item.price} each</div></div>
            <div class="qty-ctrl" style="margin:0 12px">
              <button class="qty-btn" onclick="changeQty(${ci.item.id},-1)">−</button>
              <span class="qty-n">${ci.qty}</span>
              <button class="qty-btn" onclick="changeQty(${ci.item.id},1)">+</button>
            </div>
            <div class="cart-price">₹${ci.qty*ci.item.price}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Delivery Address</div><button class="btn btn-outline btn-sm" onclick="openOverlay('addrOverlay')">Change</button></div>
      <div class="card-body-sm">
        <div class="flex gap8 fai"><span style="font-size:18px">📍</span>
          <div><div class="fw6">${S.user.name} · ${S.user.phone||''}</div>
          <div class="tm tsm mt4">${S.deliveryAddr||'No address set — click Change'}</div></div>
        </div>
      </div>
    </div>
  </div>
  <div>
    <div class="card">
      <div class="card-head"><div class="card-title">Order Summary</div></div>
      <div class="card-body">
        <div class="promo-row">
          <input id="promoInput" placeholder="Enter promo code" value="${S.promoApplied?S.promoApplied.code:''}" style="text-transform:uppercase"/>
          <button class="btn btn-outline btn-sm" onclick="applyPromo()">Apply</button>
        </div>
        ${S.promoApplied?`<div class="promo-applied">✓ ${S.promoApplied.label} <span style="margin-left:auto;cursor:pointer;color:var(--red)" onclick="removePromo()">✕ Remove</span></div>`:''}
        <div class="tm tsm mb12">Try: <code>WELCOME20</code>, <code>FLAT50</code>, <code>SAVE10</code></div>
        <hr class="div">
        <div class="sum-row"><span class="tm">Subtotal</span><span>₹${sub}</span></div>
        <div class="sum-row"><span class="tm">Delivery fee</span><span>₹${del}</span></div>
        <div class="sum-row"><span class="tm">GST (5%)</span><span>₹${tax}</span></div>
        ${disc>0?`<div class="sum-row"><span class="col-green">Promo discount</span><span class="col-green">−₹${disc}</span></div>`:''}
        <div class="sum-total"><span>Total</span><span class="col-orange lora">₹${total}</span></div>
        <hr class="div">
        <div class="fld"><label>Payment Method</label>
          <select style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:var(--r-xs);font-size:13px;outline:none;background:var(--bg)">
            <option>Cash on Delivery</option><option>UPI / GPay / PhonePe</option>
            <option>Credit / Debit Card</option><option>Net Banking</option>
          </select>
        </div>
        <button class="btn btn-primary btn-full btn-lg mt8" onclick="placeOrder()">Place Order · ₹${total} →</button>
        <div class="tm tsm mt12" style="text-align:center">🔒 Secured by 256-bit SSL encryption</div>
      </div>
    </div>
  </div>
</div>`;
};

/* ─────── ORDER CONFIRMED ─────── */
PAGES['order-confirm'] = async () => {
  const o = S.confirmedOrder || { id:'ORD-XXXX', rest:'Restaurant', items:'Items', amt:0, time:'--:--' };
  return `
<div class="success-wrap">
  <div class="success-ring">🎉</div>
  <div class="success-title">Order Placed Successfully!</div>
  <div class="success-sub">Your order has been sent to ${o.rest}. You'll get a confirmation shortly.</div>
  <div class="success-order-box">
    <div class="flex fjb fai mb12"><span class="lora fw7" style="font-size:16px">${o.id}</span>${sp('PLACED')}</div>
    <div class="flex fjb"><span class="tm tsm">Restaurant</span><span class="fw6">${o.rest}</span></div>
    <hr class="div" style="margin:10px 0">
    <div class="flex fjb"><span class="tm tsm">Items</span><span class="fw6 tsm" style="max-width:200px;text-align:right">${o.items}</span></div>
    <hr class="div" style="margin:10px 0">
    <div class="flex fjb"><span class="tm tsm">Total Paid</span><span class="lora fw7 col-orange">₹${o.amt}</span></div>
    <div class="flex fjb mt8"><span class="tm tsm">Ordered at</span><span class="tsm">${o.time}</span></div>
  </div>
  <div class="order-timeline-mini">
    <div class="otm-step"><div class="otm-dot done"></div><span>Placed</span></div>
    <div class="otm-line"></div><div class="otm-step"><div class="otm-dot"></div><span>Confirmed</span></div>
    <div class="otm-line"></div><div class="otm-step"><div class="otm-dot"></div><span>Preparing</span></div>
    <div class="otm-line"></div><div class="otm-step"><div class="otm-dot"></div><span>Delivery</span></div>
    <div class="otm-line"></div><div class="otm-step"><div class="otm-dot"></div><span>Done</span></div>
  </div>
  <div class="flex gap12 mt24">
    <button class="btn btn-outline" onclick="S.trackOrder='${o.id}';goto('track')">📍 Track Order</button>
    <button class="btn btn-primary" onclick="goto('restaurants')">Order More →</button>
  </div>
</div>`;
};

/* ─────── CUSTOMER: MY ORDERS ─────── */
PAGES['orders'] = async () => {
  const orders = await apiFetch('order.php', { action:'customer_orders', customer_id:S.user.id });
  S.orders = orders || [];
  const outForDel = S.orders.find(o=>o.status==='OUT_FOR_DELIVERY');
  return `
${outForDel?`<div class="info-banner">🛵 &nbsp;<strong>${outForDel.id}</strong> is out for delivery — arriving soon!</div>`:''}
${S.orders.length ? S.orders.map(o=>`
<div class="card mb12"><div class="card-body-sm">
  <div class="flex fai fjb mb8">
    <div class="flex fai gap10"><span class="fw7 lora" style="font-size:15px">${o.id}</span>${sp(o.status)}</div>
    <div class="lora fw7 col-orange" style="font-size:17px">₹${o.amount}</div>
  </div>
  <div class="fw6 tsm">${o.rest_name}</div>
  <div class="tm tsm mt4">${o.items}</div>
  <div class="tm txs mt4">${o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : ''}</div>
  <hr class="div">
  <div class="flex gap8">
    <button class="btn btn-outline btn-xs" onclick="S.trackOrder='${o.id}';goto('track')">📍 Track</button>
    ${o.status==='DELIVERED'?`<button class="btn btn-ghost btn-xs" onclick="goto('ratings')">⭐ Rate</button>`:''}
    <button class="btn btn-ghost btn-xs" onclick="toast('Support ticket created for ${o.id}')">🆘 Help</button>
    <button class="btn btn-ghost btn-xs" onclick="toast('Reorder placed! 🎉')">🔄 Reorder</button>
    ${o.status==='PLACED'?`<button class="btn btn-danger btn-xs" onclick="updateOrderStatus('${o.id}','CANCELLED').then(()=>goto('orders'))">Cancel</button>`:''}
  </div>
</div></div>`).join('')
: '<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">No orders yet</div><button class="btn btn-primary" onclick="goto(\'restaurants\')">Order Now</button></div>'}`;
};

/* ─────── CUSTOMER: TRACK ─────── */
PAGES['track'] = async () => {
  const orders = await apiFetch('order.php', { action:'customer_orders', customer_id:S.user.id });
  S.orders = orders || [];
  if (!S.trackOrder && S.orders.length) S.trackOrder = S.orders[0].id;
  const o = S.orders.find(x=>x.id===S.trackOrder) || S.orders[0];
  if (!o) return '<div class="empty"><div class="empty-ico">📍</div><div class="empty-title">No orders to track</div></div>';

  const steps = [
    { ico:'📋', label:'Order Placed',    sub:'Received by system' },
    { ico:'✅', label:'Confirmed',       sub:'Restaurant confirmed' },
    { ico:'👨‍🍳', label:'Being Prepared',  sub:'Chef is cooking your order' },
    { ico:'🛵', label:'Out for Delivery',sub:'Agent picked up your order' },
    { ico:'🎉', label:'Delivered',       sub:'Enjoy your meal!' },
  ];
  const allStatuses = ['PLACED','CONFIRMED','PREPARING','OUT_FOR_DELIVERY','DELIVERED'];
  const si = allStatuses.indexOf(o.status);

  return `
<button class="btn btn-ghost btn-sm mb16" onclick="goto('orders')">← Back to Orders</button>
<div class="fld mb16" style="max-width:280px"><label>Switch Order</label>
  <select style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--r-xs);font-size:13px;outline:none;background:var(--bg)" onchange="S.trackOrder=this.value;goto('track')">
    ${S.orders.map(ord=>`<option value="${ord.id}" ${ord.id===o.id?'selected':''}>${ord.id} · ${ord.rest_name}</option>`).join('')}
  </select>
</div>
<div class="g2-aside">
  <div>
    <div class="track-card mb16">
      <div class="card-head"><div><div class="card-title">${o.id}</div><div class="tm tsm mt4">${o.rest_name} · ${o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : ''}</div></div>${sp(o.status)}</div>
      <div class="track-steps">
        ${steps.map((s,i)=>{
          const cls = i<si?'done':i===si?'active':'pending';
          return `<div class="track-step ${cls}">
            <div class="track-dot">${i<si?'✓':s.ico}</div>
            <div class="track-info"><div class="track-label">${s.label}</div><div class="track-sub">${i<=si?s.sub:'Pending'}</div></div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>
  <div>
    <div class="card"><div class="card-head"><div class="card-title">Order Details</div></div>
      <div class="card-body-sm">
        <div class="tm tsm mb4">Items</div><div class="fw6 tsm mb12">${o.items}</div>
        <hr class="div">
        <div class="tsm fw6 mb12">${S.deliveryAddr||'—'}</div>
        <hr class="div">
        <div class="flex fjb"><span class="tm">Total paid</span><span class="lora fw7 col-orange">₹${o.amount}</span></div>
      </div>
    </div>
  </div>
</div>`;
};

/* ─────── CUSTOMER: RATINGS ─────── */
PAGES['ratings'] = async () => {
  const [rests, orders, reviews] = await Promise.all([
    apiFetch('restaurants.php'),
    apiFetch('order.php', { action:'customer_orders', customer_id:S.user.id }),
    apiFetch('order.php', { action:'get_ratings' }),
  ]);
  S.restaurants = rests || []; S.orders = orders || [];
  const delivered = S.orders.filter(o=>o.status==='DELIVERED');
  const recentReviews = reviews || [];

  return `
<div class="g2" style="align-items:start">
  <div class="card">
    <div class="card-head"><div class="card-title">Write a Review</div></div>
    <div class="card-body">
      <div class="fld"><label>Restaurant</label>
        <select id="ratingRestSel" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:var(--r-xs);font-size:13px;outline:none;background:var(--bg)" onchange="S.ratingRest=parseInt(this.value)">
          ${S.restaurants.map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
      </div>
      <div class="fld"><label>Link to Order (optional)</label>
        <select id="ratingOrderSel" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:var(--r-xs);font-size:13px;outline:none;background:var(--bg)">
          <option value="">Select an order…</option>
          ${delivered.map(o=>`<option value="${o.id}">${o.id} · ${o.rest_name}</option>`).join('')}
        </select>
      </div>
      <div class="fld"><label>Your Rating</label>
        <div class="star-row" style="margin-bottom:4px">
          ${[1,2,3,4,5].map(i=>`<span class="star${i<=S.ratingVal?' on':''}" id="st${i}" onclick="setRating(${i})">★</span>`).join('')}
        </div>
        <div class="tm tsm" id="ratingLbl">${['','Poor','Fair','Good','Very Good','Excellent'][S.ratingVal]||'Tap a star to rate'}</div>
      </div>
      <div class="fld"><label>Your Review</label>
        <textarea class="fld" id="rvText" rows="3" placeholder="Share your honest experience…"></textarea>
      </div>
      <button class="btn btn-primary btn-full" onclick="submitRating()">Submit Review</button>
    </div>
  </div>
  <div><div class="sec-title mb16">Recent Reviews</div>
    <div class="g1">
      ${recentReviews.length ? recentReviews.map(r=>`
        <div class="card">
          <div class="card-body">
            <div class="flex fjb mb8">
              <div class="fw7 tsm">${r.customer_name}</div>
              <div class="col-orange">${'★'.repeat(r.stars)}</div>
            </div>
            <div class="tm tsm mb4">${r.rest_name}</div>
            <div class="tm txs">${r.comment}</div>
          </div>
        </div>
      `).join('') : '<div class="tm tsm">No reviews yet. Be the first to rate!</div>'}
    </div>
  </div>
</div>`;
};



/* ─────── CUSTOMER: PROFILE ─────── */
PAGES['profile'] = async () => {
  const userData = await apiFetch('login.php', { action:'get_profile', id:S.user.id });
  if (userData && !userData.error) S.user = { ...S.user, ...userData };

  return `
<div class="profile-banner">
  <div class="profile-av-big">${S.user.name[0].toUpperCase()}</div>
  <div style="position:relative;z-index:1">
    <div class="profile-name">${S.user.name}</div>
    <div class="profile-meta">${S.user.email} · ${S.role.charAt(0).toUpperCase()+S.role.slice(1)}</div>
    <div class="profile-meta mt4">Member since ${S.user.created_at||'N/A'}</div>
  </div>
</div>
<div class="g2" style="align-items:start">
  <div class="card">
    <div class="card-head"><div class="card-title">Edit Profile</div></div>
    <div class="card-body">
      <div class="g2">
        <div class="fld"><label>Full Name</label><input id="pf-name" value="${S.user.name}"/></div>
        <div class="fld"><label>Phone</label><input id="pf-phone" value="${S.user.phone||''}"/></div>
      </div>
      <div class="fld"><label>Instagram ID</label><input id="pf-insta" value="${S.user.instagram_id||''}" placeholder="@username"/></div>
      <div class="fld"><label>Email</label><input id="pf-email" value="${S.user.email}" disabled style="opacity:.6"/></div>
      <button class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
    </div>
  </div>
  <div><div class="card"><div class="card-body-sm">
    <button class="btn btn-danger btn-full btn-sm" onclick="doLogout()">← Logout</button>
  </div></div></div>
</div>`;
};

/* ─────── SELLER: DASHBOARD ─────── */
PAGES['s-dash'] = async () => {
  const [allOrders, menu] = await Promise.all([
    apiFetch('order.php', { action:'restaurant_orders', rest_id:S.sellerRestId }),
    apiFetch('menu.php',  { rest_id:S.sellerRestId }),
  ]);
  S.orders = allOrders || [];
  S.menus[S.sellerRestId] = menu || [];
  const newO    = S.orders.filter(o=>o.status==='PLACED').length;
  const prep    = S.orders.filter(o=>o.status==='PREPARING').length;
  const deliv   = S.orders.filter(o=>o.status==='DELIVERED').length;
  const lowStock= (S.menus[S.sellerRestId]||[]).filter(i=>i.stock<=10);

  const summary = await apiFetch('order.php', { action:'revenue_summary', rest_id:S.sellerRestId });
  const rev = summary?.total_revenue || 0;

  return `
<div class="kpi-row">
  <div class="kpi" style="--kpi-color:var(--green)"><span class="kpi-icon">💰</span><div class="kpi-label">Revenue</div><div class="kpi-value">₹${Number(rev).toLocaleString()}</div></div>
  <div class="kpi" style="--kpi-color:var(--orange)"><span class="kpi-icon">🆕</span><div class="kpi-label">New Orders</div><div class="kpi-value">${newO}</div></div>
  <div class="kpi" style="--kpi-color:var(--amber)"><span class="kpi-icon">👨‍🍳</span><div class="kpi-label">In Kitchen</div><div class="kpi-value">${prep}</div></div>
  <div class="kpi" style="--kpi-color:var(--blue)"><span class="kpi-icon">✅</span><div class="kpi-label">Delivered</div><div class="kpi-value">${deliv}</div></div>
</div>
<div class="g2">
  <div class="card">
    <div class="card-head"><div class="card-title">Recent Orders</div><button class="btn btn-outline btn-sm" onclick="goto('s-orders')">View all</button></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${S.orders.slice(0,5).map(o=>`<tr>
        <td style="font-family:monospace;font-size:12px">${o.id}</td>
        <td class="fw6">${o.customer}</td>
        <td class="col-orange fw7">₹${o.amount}</td>
        <td>${sp(o.status)}</td></tr>`).join('')}
      </tbody>
    </table></div>
  </div>
  <div class="card">
    <div class="card-head"><div class="card-title">Low Stock Alert</div></div>
    <div style="padding:8px 16px 12px">
      ${lowStock.slice(0,5).map(i=>`
        <div class="flex fai fjb" style="padding:7px 0;border-bottom:1px solid var(--border)">
          <span class="tsm fw6">🍽️ ${i.name}</span>
          <span class="badge ${i.stock<=5?'badge-red':'badge-amber'}">${i.stock} left</span>
        </div>`).join('') || '<div class="tm tsm" style="padding:8px 0">All items well stocked ✓</div>'}
    </div>
  </div>
</div>`;
};

/* ─────── SELLER: ORDERS ─────── */
PAGES['s-orders'] = async () => {
  const orders = await apiFetch('order.php', { action:'restaurant_orders', rest_id:S.sellerRestId });
  S.orders = orders || [];

  return `
<div class="kpi-row">
  ${[['PLACED','📥','slate'],['PREPARING','🍳','amber'],['OUT_FOR_DELIVERY','🛵','blue'],['DELIVERED','✅','green']].map(([s,ic,c])=>`
    <div class="kpi" style="--kpi-color:var(--${c})"><span class="kpi-icon">${ic}</span><div class="kpi-label">${s.replace(/_/g,' ')}</div><div class="kpi-value">${S.orders.filter(o=>o.status===s).length}</div></div>`).join('')}
</div>
<div class="card">
  <div class="card-head"><div class="card-title">All Orders</div></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${S.orders.map(o=>`<tr>
      <td style="font-family:monospace;font-size:12px">${o.id}</td>
      <td class="fw6">${o.customer}</td>
      <td class="tm tsm" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.items}</td>
      <td class="col-orange fw7">₹${o.amount}</td>
      <td>${sp(o.status)}</td>
      <td><select class="status-sel" onchange="updateOrderStatus('${o.id}',this.value)">
        <option value="">Update →</option>
        <option value="CONFIRMED">Confirm</option><option value="PREPARING">Preparing</option>
        <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
        <option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancel</option>
      </select></td></tr>`).join('')}
    </tbody>
  </table></div>
</div>`;
};

/* ─────── SELLER: MENU CRUD ─────── */
PAGES['s-menu'] = async () => {
  const menu = await apiFetch('menu.php', { rest_id:S.sellerRestId });
  S.menus[S.sellerRestId] = menu || [];
  const items = S.menus[S.sellerRestId];

  return `
<div class="sec-head">
  <div><div class="sec-title">Menu Management</div><div class="sec-sub">${items.length} items</div></div>
  <button class="btn btn-primary" onclick="S.editItemId=null;document.getElementById('addItemTitle').textContent='Add Menu Item';['mi-name','mi-cat','mi-price','mi-stock','mi-desc'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});openOverlay('addItemOverlay')">+ Add Item</button>
</div>
<div class="card">
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
    <tbody>${items.map(item=>`<tr>
      <td><div class="flex fai gap10"><span style="font-size:18px">🍽️</span><div>
        <div class="fw7 tsm">${item.name}</div>
        <div class="tm txs">${(item.description||'').substring(0,40)}</div>
      </div></div></td>
      <td><span class="badge badge-muted">${item.category||''}</span></td>
      <td class="col-orange fw7">₹${item.price}</td>
      <td><span class="badge ${item.stock>10?'badge-green':item.stock>0?'badge-amber':'badge-red'}">${item.stock} left</span></td>
      <td><div class="flex gap6">
        <button class="btn btn-ghost btn-xs" onclick="editItem(${item.id})">✏️ Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deleteItem(${item.id})">🗑️</button>
      </div></td></tr>`).join('')}
    </tbody>
  </table></div>
</div>`;
};

/* ─────── SELLER: REVENUE ─────── */
PAGES['s-revenue'] = async () => {
  const summary = await apiFetch('order.php', { action:'revenue_summary', rest_id:S.sellerRestId });
  const topRests = summary?.top_restaurants || [];
  const myRest = topRests.find(r => r.restaurant_id == S.sellerRestId) || topRests[0];

  return `
<div class="kpi-row">
  <div class="kpi" style="--kpi-color:var(--green)"><span class="kpi-icon">💰</span><div class="kpi-label">Total Revenue</div>
    <div class="kpi-value">₹${Number(summary?.total_revenue || 0).toLocaleString()}</div></div>
  <div class="kpi" style="--kpi-color:var(--orange)"><span class="kpi-icon">📦</span><div class="kpi-label">Total Orders</div>
    <div class="kpi-value">${summary?.total_orders || 0}</div></div>
  <div class="kpi" style="--kpi-color:var(--blue)"><span class="kpi-icon">✅</span><div class="kpi-label">Delivered</div>
    <div class="kpi-value">${summary?.delivered_orders || 0}</div></div>
</div>
${topRests.length?`<div class="card mt16">
  <div class="card-head"><div class="card-title">Revenue by Restaurant</div></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Restaurant</th><th>Orders</th><th>Revenue</th></tr></thead>
    <tbody>${topRests.map(r=>`<tr>
      <td class="fw6">${r.rest_name}</td><td>${r.order_count}</td>
      <td class="col-orange fw7">₹${Number(r.total_revenue).toLocaleString()}</td></tr>`).join('')}
    </tbody>
  </table></div>
</div>`:'<div class="card mt16"><div class="card-body-sm tm tsm">No delivered orders yet.</div></div>'}`;
};

/* ─────── SELLER: TOP ITEMS ─────── */
PAGES['s-topitems'] = async () => {
  const menu = await apiFetch('menu.php', { rest_id:S.sellerRestId });
  S.menus[S.sellerRestId] = menu || [];
  const items = S.menus[S.sellerRestId];

  return `
<div class="card">
  <div class="card-head"><div class="card-title">Menu Items — Stock Levels</div></div>
  <div class="card-body-sm bar-chart">
    ${items.map(item=>`
      <div class="bar-row">
        <span class="bar-label">${item.name}</span>
        <div class="bar-track"><div class="bar-fill bf-o" style="width:${Math.min(100,item.stock)}%"></div></div>
        <span class="bar-val">${item.stock} in stock</span>
      </div>`).join('')}
  </div>
</div>`;
};

/* ─────── ADMIN: DASHBOARD ─────── */
PAGES['a-dash'] = async () => {
  const [rests, orders] = await Promise.all([
    apiFetch('restaurants.php'),
    apiFetch('order.php', { action:'all_orders' }),
  ]);
  S.restaurants = rests || []; S.orders = orders || [];
  const totalRev = S.orders.filter(o=>o.status==='DELIVERED')
    .reduce((a,o)=>a+Number(o.amount||0), 0);

  return `
<div class="kpi-row">
  <div class="kpi" style="--kpi-color:var(--orange)"><span class="kpi-icon">💰</span><div class="kpi-label">Platform Revenue</div><div class="kpi-value">₹${totalRev.toLocaleString()}</div><div class="kpi-sub">Delivered orders</div></div>
  <div class="kpi" style="--kpi-color:var(--green)"><span class="kpi-icon">🏪</span><div class="kpi-label">Active Restaurants</div><div class="kpi-value">${S.restaurants.filter(r=>r.active==1).length}/${S.restaurants.length}</div></div>
  <div class="kpi" style="--kpi-color:var(--amber)"><span class="kpi-icon">📦</span><div class="kpi-label">Total Orders</div><div class="kpi-value">${S.orders.length}</div></div>
  <div class="kpi" style="--kpi-color:var(--blue)"><span class="kpi-icon">✅</span><div class="kpi-label">Delivered</div><div class="kpi-value">${S.orders.filter(o=>o.status==='DELIVERED').length}</div></div>
</div>
<div class="g2">
  <div class="card">
    <div class="card-head"><div class="card-title">Restaurants</div></div>
    <div class="card-body-sm bar-chart">
      ${S.restaurants.map((r,i)=>`
        <div class="bar-row">
          <span class="bar-label">${r.name}</span>
          <div class="bar-track"><div class="bar-fill bf-${['o','g','a','r','s','b'][i]||'o'}" style="width:${r.active==1?80:20}%"></div></div>
          <span class="bar-val">${r.active==1?'Open':'Closed'}</span>
        </div>`).join('')}
    </div>
  </div>
  <div class="card">
    <div class="card-head"><div class="card-title">Live Order Feed</div></div>
    <div style="padding:6px 16px 12px">
      ${S.orders.slice(0,8).map(o=>`
        <div class="flex fai gap10" style="padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="width:8px;height:8px;border-radius:50%;background:${{DELIVERED:'var(--green)',PLACED:'var(--slate)',CONFIRMED:'var(--amber)',PREPARING:'var(--orange)',OUT_FOR_DELIVERY:'var(--blue)',CANCELLED:'var(--red)'}[o.status]||'var(--slate)'};flex-shrink:0"></div>
          <div style="flex:1"><span class="fw6 tsm">${o.id}</span><span class="tm txs"> · ${o.customer}</span><div>${sp(o.status)}</div></div>
          <span class="txs tm">${o.created_at}</span>
        </div>`).join('')}
    </div>
  </div>
</div>`;
};

/* ─────── ADMIN: USERS ─────── */
PAGES['a-users'] = async () => {
  const users = await apiFetch('login.php', { action:'get_users' });
  S.users = users || [];

  return `
<div class="sec-head"><div><div class="sec-title">User Management</div><div class="sec-sub">${S.users.length} total users</div></div></div>
<div class="search-wrap"><span class="search-icon">🔍</span>
  <input placeholder="Search by name or email…" oninput="const q=this.value.toLowerCase();document.querySelectorAll('tr[data-role]').forEach(r=>{r.style.display=r.textContent.toLowerCase().includes(q)?'':'none'})"/>
</div>
<div class="chips">
  ${['all','customer','seller','admin'].map((r,i)=>`
    <div class="chip${i===0?' active':''}" onclick="filterUsers('${r}',this)">${r.charAt(0).toUpperCase()+r.slice(1)}</div>`).join('')}
</div>
<div class="card">
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Phone</th><th>Joined</th><th>Actions</th></tr></thead>
    <tbody>${S.users.map((u,i)=>`
      <tr data-role="${u.role}">
        <td><div class="flex fai gap10">
          <div style="width:30px;height:30px;border-radius:50%;background:${['var(--orange-bg)','var(--green-bg)','var(--amber-bg)','var(--blue-bg)','var(--slate-bg)'][i%5]};display:flex;align-items:center;justify-content:center;font-family:Lora,serif;font-size:12px;font-weight:700;color:${['var(--orange)','var(--green)','var(--amber)','var(--blue)','var(--slate)'][i%5]};flex-shrink:0">${(u.name||'?')[0]}</div>
          <span class="fw7 tsm">${u.name}</span>
        </div></td>
        <td class="tm tsm">${u.email}</td>
        <td><span class="badge ${u.role==='admin'?'badge-orange':u.role==='seller'?'badge-green':'badge-slate'}">${u.role}</span></td>
        <td class="tm tsm">${u.phone||'—'}</td>
        <td class="tm tsm">${u.created_at||'—'}</td>
        <td><div class="flex gap6">
          <button class="btn btn-ghost btn-xs" onclick="viewUserDetails(${u.id})">View</button>
          ${u.id!=S.user.id?`<button class="btn btn-danger btn-xs" onclick="if(confirm('Delete ${u.name}?'))deleteUser(${u.id})">Del</button>`:''}
        </div></td>
      </tr>`).join('')}
    </tbody>
  </table></div>
</div>`;
};

/* ─────── ADMIN: RESTAURANTS ─────── */
PAGES['a-restaurants'] = async () => {
  const rests = await apiFetch('restaurants.php');
  S.restaurants = rests || [];

  return `
<div class="sec-head"><div><div class="sec-title">Restaurant Management</div><div class="sec-sub">${S.restaurants.length} restaurants, ${S.restaurants.filter(r=>r.active==1).length} active</div></div></div>
<div class="card">
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Restaurant</th><th>Cuisine</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${S.restaurants.map(r=>{
    const active=r.active==1;
    return `<tr>
      <td><div class="flex fai gap10"><span style="font-size:20px">🍽️</span><span class="fw7">${r.name}</span></div></td>
      <td>${r.cuisine||''}</td>
      <td><span class="badge ${active?'badge-green':'badge-red'}">${active?'Active':'Inactive'}</span></td>
      <td><div class="flex gap6">
        <button class="btn btn-ghost btn-xs" onclick="viewRestDetails(${r.id})">Details</button>
        <button class="btn btn-xs ${active?'btn-danger':''}" style="${!active?'background:var(--green-bg);color:var(--green2);border:1.5px solid rgba(58,125,92,.2)':''}" onclick="toggleRestaurant(${r.id})">${active?'Disable':'Enable'}</button>
      </div></td></tr>`;}).join('')}
    </tbody>
  </table></div>
</div>`;
};

/* ─────── ADMIN: ALL ORDERS ─────── */
PAGES['a-orders'] = async () => {
  const orders = await apiFetch('order.php', { action:'all_orders' });
  S.orders = orders || [];

  return `
<div class="kpi-row">
  ${['PLACED','CONFIRMED','PREPARING','OUT_FOR_DELIVERY','DELIVERED'].map(s=>`
    <div class="kpi" style="--kpi-color:var(--orange);padding:14px 16px">
      <div class="kpi-label">${s.replace(/_/g,' ')}</div>
      <div class="kpi-value" style="font-size:22px">${S.orders.filter(o=>o.status===s).length}</div>
    </div>`).join('')}
</div>
<div class="card">
  <div class="card-head"><div class="card-title">All Orders (${S.orders.length})</div></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Order ID</th><th>Customer</th><th>Restaurant</th><th>Items</th><th>Amount</th><th>Status</th><th>Update</th></tr></thead>
    <tbody>${S.orders.map(o=>`<tr>
      <td style="font-family:monospace;font-size:12px">${o.id}</td>
      <td class="fw7">${o.customer}</td>
      <td>${o.rest_name}</td>
      <td class="tm tsm" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.items}</td>
      <td class="col-orange fw7">₹${o.amount}</td>
      <td>${sp(o.status)}</td>
      <td><select class="status-sel" onchange="updateOrderStatus('${o.id}',this.value)">
        <option value="">Change →</option>
        <option value="CONFIRMED">Confirm</option><option value="PREPARING">Preparing</option>
        <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
        <option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancel</option>
      </select></td></tr>`).join('')}
    </tbody>
  </table></div>
</div>`;
};

/* ─────── ADMIN: ANALYTICS ─────── */
PAGES['a-analytics'] = async () => {
  const [rests, orders, summary] = await Promise.all([
    apiFetch('restaurants.php'),
    apiFetch('order.php', { action:'all_orders' }),
    apiFetch('order.php', { action:'revenue_summary' }),
  ]);
  S.restaurants = rests || []; S.orders = orders || [];
  const topRests = summary?.top_restaurants || [];

  // Top customers by order count (computed client-side)
  const custMap = {};
  S.orders.forEach(o => { const k=o.customer||'Unknown'; custMap[k]=(custMap[k]||0)+1; });
  const topCust = Object.entries(custMap)
    .map(([name,count])=>({customer:name,order_count:count}))
    .sort((a,b)=>b.order_count-a.order_count).slice(0,5);

  return `
<div class="g2">
  <div class="card">
    <div class="card-head"><div class="card-title">Top Restaurants by Revenue</div></div>
    <div class="card-body-sm bar-chart">
      ${topRests.map((r,i)=>`
        <div class="bar-row">
          <span class="bar-label">${r.rest_name}</span>
          <div class="bar-track"><div class="bar-fill bf-${['o','g','a','r','s'][i]||'o'}" style="width:${Math.round(r.total_revenue/(topRests[0]?.total_revenue||1)*100)}%"></div></div>
          <span class="bar-val">₹${Number(r.total_revenue).toLocaleString()}</span>
          <span class="tm txs ml8">⭐ ${r.avg_rating||0}</span>
        </div>`).join('') || '<div class="tm tsm">No data yet</div>'}
    </div>
  </div>
  <div class="card">
    <div class="card-head"><div class="card-title">Top Customers</div></div>
    <div class="card-body-sm bar-chart">
      ${topCust.map((c,i)=>`
        <div class="bar-row">
          <span class="bar-label">${c.customer}</span>
          <div class="bar-track"><div class="bar-fill bf-${['o','g','a','r','s'][i]||'o'}" style="width:${Math.round(c.order_count/(topCust[0]?.order_count||1)*100)}%"></div></div>
          <span class="bar-val">${c.order_count} orders</span>
        </div>`).join('') || '<div class="tm tsm">No data yet</div>'}
    </div>
  </div>
</div>
<div class="card mt16">
  <div class="card-head"><div class="card-title">All Restaurants</div></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Restaurant</th><th>Cuisine</th><th>Status</th></tr></thead>
    <tbody>${S.restaurants.map(r=>`
      <tr>
        <td><span class="fw7">${r.name}</span></td>
        <td>${r.cuisine||''}</td>
        <td><span class="badge ${r.active==1?'badge-green':'badge-red'}">${r.active==1?'Active':'Inactive'}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>
</div>`;
};

async function viewRestDetails(id) {
  const r = S.restaurants.find(x => x.id == id);
  if (!r) return;
  document.getElementById('rdTitle').textContent = `Manage: ${r.name}`;
  const body = document.getElementById('rdBody');
  body.innerHTML = '<div class="tm tsm p20">Loading details…</div>';
  openOverlay('restDetailsOverlay');

  const [menu, orders] = await Promise.all([
    apiFetch('menu.php', { rest_id: id }),
    apiFetch('order.php', { action: 'all_orders' }) 
  ]);

  const restOrders = (orders || []).filter(o => o.restaurant_id == id);
  
  body.innerHTML = `
    <div class="sec-head"><div class="sec-title" style="font-size:16px">Menu & Stock Levels</div></div>
    <div class="tbl-wrap mb24"><table class="tbl">
      <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
      <tbody>${(menu || []).map(m => `
        <tr>
          <td class="fw7">${m.name}</td>
          <td><span class="badge badge-muted">${m.category}</span></td>
          <td>₹${m.price}</td>
          <td><span class="fw7" style="color:${m.stock < 10 ? 'var(--red)' : 'inherit'}">${m.stock}</span></td>
          <td><span class="badge ${m.available ? 'badge-green' : 'badge-red'}">${m.available ? 'Available' : 'Hidden'}</span></td>
        </tr>`).join('') || '<tr><td colspan="5" class="tm tsm">No items found</td></tr>'}
      </tbody>
    </table></div>

    <div class="sec-head"><div class="sec-title" style="font-size:16px">Recent Orders</div></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${restOrders.slice(0, 5).map(o => `
        <tr>
          <td class="tm tsm">${o.id}</td>
          <td class="fw7">${o.customer}</td>
          <td class="fw7 col-orange">₹${o.amount}</td>
          <td>${sp(o.status)}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="tm tsm">No recent orders</td></tr>'}
      </tbody>
    </table></div>
  `;
}

async function viewUserDetails(id) {
  const u = S.users.find(x => x.id == id);
  if (!u) return;
  document.getElementById('udTitle').textContent = `Profile: ${u.name}`;
  const body = document.getElementById('udBody');
  body.innerHTML = '<div class="tm tsm p20">Loading profile…</div>';
  openOverlay('userDetailsOverlay');

  // Fetch their orders if they are a customer
  const orders = await apiFetch('order.php', { action: 'customer_orders', customer_id: id });
  
  body.innerHTML = `
    <div class="card mb16">
      <div class="card-body">
        <div class="flex fai gap16">
          <div style="width:60px;height:60px;border-radius:50%;background:var(--orange-bg);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--orange)">${u.name[0]}</div>
          <div>
            <div class="fw7 lora" style="font-size:20px">${u.name}</div>
            <div class="tm tsm">${u.email} · ${u.role.toUpperCase()}</div>
          </div>
        </div>
        <div class="g2 mt20">
          <div class="fld"><label>Phone</label><div>${u.phone || 'N/A'}</div></div>
          <div class="fld"><label>Joined</label><div>${u.created_at}</div></div>
        </div>
      </div>
    </div>

    <div class="sec-head"><div class="sec-title" style="font-size:16px">Order History</div></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Order ID</th><th>Restaurant</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${(orders || []).map(o => `
        <tr>
          <td class="tm tsm">${o.id}</td>
          <td class="fw7">${o.rest_name}</td>
          <td class="fw7 col-orange">₹${o.amount}</td>
          <td>${sp(o.status)}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="tm tsm">No orders found for this user</td></tr>'}
      </tbody>
    </table></div>
  `;
}

function togglePass(id, el) {
  const input = document.getElementById(id);
  if (input.type === 'password') {
    input.type = 'text';
    el.textContent = '🙈';
  } else {
    input.type = 'password';
    el.textContent = '👁️';
  }
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.getElementById('topDate').textContent = new Date().toLocaleDateString('en-IN',
  { weekday:'short', day:'numeric', month:'short' });
