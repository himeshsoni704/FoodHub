<?php
// ─── send_instagram.php ───────────────────────────────────────────────────────
// Called internally by order.php via triggerInstagramNotif()
// Looks up the user's Instagram handle and fires InstaApp.py in CLI mode.
// ─────────────────────────────────────────────────────────────────────────────

header('Content-Type: application/json');

include 'db.php';   // provides $conn (mysqli)

$logfile = __DIR__ . '/instagram_debug.log';

function ig_log($msg) {
    global $logfile;
    file_put_contents($logfile, date('[Y-m-d H:i:s] ') . $msg . "\n", FILE_APPEND);
}

// ── Parse input ───────────────────────────────────────────────────────────────
$body    = json_decode(file_get_contents('php://input'), true) ?? [];
$user_id = (int)($body['user_id'] ?? 0);
$message = trim($body['message']  ?? '');

ig_log("Request received — user_id=$user_id  message=\"$message\"");

if (!$user_id || !$message) {
    ig_log("Aborted: missing user_id or message");
    echo json_encode(['error' => 'Missing user_id or message']);
    exit;
}

// ── Look up Instagram handle ──────────────────────────────────────────────────
$handle = null;

// Primary: user_socials table (preferred — InstaApp.py uses same table)
$res = $conn->query(
    "SELECT handle FROM user_socials
     WHERE user_id=$user_id AND platform='instagram'
     LIMIT 1"
);
if ($res && $row = $res->fetch_assoc()) {
    $handle = trim($row['handle']);
}

// Fallback: users.instagram_id alias column via LEFT JOIN in login.php
// (Some deployments store it there too — this is a safety net)
if (!$handle) {
    $res2 = $conn->query("SELECT instagram_id AS handle FROM users WHERE id=$user_id LIMIT 1");
    if ($res2 && $row2 = $res2->fetch_assoc()) {
        $handle = trim($row2['handle'] ?? '');
    }
}

// Strip leading @ if present
$handle = ltrim($handle ?? '', '@');

if (!$handle) {
    ig_log("No Instagram handle for user_id=$user_id — skipping DM");
    echo json_encode(['status' => 'skipped', 'reason' => 'no_handle']);
    exit;
}

ig_log("Handle resolved: @$handle");

// ── Locate python3 ───────────────────────────────────────────────────────────
// apache/www-data has a minimal PATH — find python3 explicitly.
// FIX: Removed the broken PYTHONPATH=python_packages approach.
//      Python packages are installed system-wide (pip install) so no PYTHONPATH needed.
$python3 = '';
foreach (['/usr/bin/python3', '/usr/local/bin/python3', '/bin/python3'] as $candidate) {
    if (file_exists($candidate) && is_executable($candidate)) {
        $python3 = $candidate;
        break;
    }
}
// Last resort: try 'which'
if (!$python3) {
    $python3 = trim(shell_exec('which python3 2>/dev/null') ?: '');
}
if (!$python3) {
    ig_log("ERROR: python3 not found on this system");
    echo json_encode(['error' => 'python3 not found']);
    exit;
}

// ── Locate InstaApp.py ────────────────────────────────────────────────────────
// php/api/ is two levels below the project root where InstaApp.py lives
$script = realpath(__DIR__ . '/../../InstaApp.py');

if (!$script || !file_exists($script)) {
    ig_log("ERROR: InstaApp.py not found at " . __DIR__ . '/../../InstaApp.py');
    echo json_encode(['error' => 'InstaApp.py not found']);
    exit;
}

ig_log("Python: $python3   Script: $script");

// ── Build and fire the command ────────────────────────────────────────────────
// Run in background (&) so PHP returns immediately without waiting for the DM.
// PATH is set explicitly so instagrapi and other packages resolve correctly.
$cmd = 'PATH=/usr/local/bin:/usr/bin:/bin'
     . ' ' . escapeshellcmd($python3)
     . ' ' . escapeshellarg($script)
     . ' ' . escapeshellarg($handle)
     . ' ' . escapeshellarg($message)
     . ' >> ' . escapeshellarg($logfile) . ' 2>&1 &';

ig_log("Executing: $cmd");
exec($cmd);
ig_log("Command dispatched for @$handle");

echo json_encode(['status' => 'ok', 'handle' => $handle]);
exit;
?>
