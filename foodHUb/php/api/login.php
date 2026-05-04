<?php
include 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = file_get_contents('php://input');
$body   = json_decode($input, true) ?? [];
if (empty($body)) $body = $_POST;

$action = $body['action'] ?? $_GET['action'] ?? '';

if ($method === 'POST') {

    // ── REGISTER ──────────────────────────────────────────────────────────────
    if ($action === 'register') {
        $name  = $conn->real_escape_string(trim($body['name']  ?? ''));
        $email = $conn->real_escape_string(trim($body['email'] ?? ''));
        $pass  = $body['password'] ?? '';
        $phone = $conn->real_escape_string(trim($body['phone'] ?? ''));
        $insta = $conn->real_escape_string(trim($body['instagram_id'] ?? ''));
        $role  = $body['role'] ?? 'customer';

        if (!in_array($role, ['customer', 'seller'])) $role = 'customer';

        if (!$name || !$email || !$pass) {
            echo json_encode(["error" => "Name, email and password are required"]);
            exit;
        }
        if (strlen($pass) < 6) {
            echo json_encode(["error" => "Password must be at least 6 characters"]);
            exit;
        }

        $check = $conn->query("SELECT id FROM users WHERE email='$email' LIMIT 1");
        if ($check && $check->num_rows > 0) {
            echo json_encode(["error" => "Email already registered. Please log in."]);
            exit;
        }

        $hashed = $conn->real_escape_string(password_hash($pass, PASSWORD_BCRYPT));
        $avatar = strtoupper(substr($name, 0, 1));

        // FIX: was missing 'address' column in INSERT — caused column-count mismatch
        $conn->query("INSERT INTO users (name, email, password, role, phone, address, avatar)
                      VALUES ('$name', '$email', '$hashed', '$role', '$phone', '', '$avatar')");
        $newId = $conn->insert_id;

        if (!$newId) {
            echo json_encode(["error" => "Could not create account: " . $conn->error]);
            exit;
        }

        // Save Instagram handle in user_socials
        if ($insta) {
            $instaHandle = ltrim($insta, '@'); // strip @ if user typed it
            $instaHandle = $conn->real_escape_string($instaHandle);
            $conn->query("INSERT INTO user_socials (user_id, platform, handle)
                          VALUES ($newId, 'instagram', '$instaHandle')
                          ON DUPLICATE KEY UPDATE handle='$instaHandle'");
        }

        // Return full user row for auto-login
        $res  = $conn->query("SELECT u.*, us.handle AS instagram_id
                              FROM users u
                              LEFT JOIN user_socials us
                                ON u.id = us.user_id AND us.platform = 'instagram'
                              WHERE u.id=$newId LIMIT 1");
        $user = $res->fetch_assoc();
        unset($user['password']);
        $user['status'] = 'success';
        echo json_encode($user);
        exit;
    }

    // ── LOGIN ──────────────────────────────────────────────────────────────────
    if ($action === '' || $action === 'login') {
        $email = $conn->real_escape_string($body['email'] ?? '');
        $pass  = $body['password'] ?? '';

        if (!$email || !$pass) {
            echo json_encode(["error" => "Email and password required"]);
            exit;
        }

        $result = $conn->query(
            "SELECT u.*, us.handle AS instagram_id
             FROM users u
             LEFT JOIN user_socials us ON u.id = us.user_id AND us.platform = 'instagram'
             WHERE u.email = '$email' LIMIT 1"
        );

        if ($result && $result->num_rows > 0) {
            $user = $result->fetch_assoc();

            // Support both plain-text legacy passwords (seed data) and bcrypt hashes
            $is_match = ($pass === $user['password']) || password_verify($pass, $user['password']);

            if ($is_match) {
                // If password is still plain text, silently upgrade it to bcrypt
                if ($pass === $user['password']) {
                    $newHash = $conn->real_escape_string(password_hash($pass, PASSWORD_BCRYPT));
                    $conn->query("UPDATE users SET password='$newHash' WHERE id={$user['id']}");
                }

                unset($user['password']);
                $user['status'] = 'success';
                echo json_encode($user);
            } else {
                echo json_encode(["error" => "Invalid password"]);
            }
        } else {
            echo json_encode(["error" => "User not found"]);
        }
        exit;
    }

    // ── UPDATE PROFILE ─────────────────────────────────────────────────────────
    if ($action === 'update_profile') {
        $uid   = (int)($body['id']   ?? 0);
        $name  = $conn->real_escape_string($body['name']  ?? '');
        $phone = $conn->real_escape_string($body['phone'] ?? '');
        $insta = ltrim($body['instagram_id'] ?? '', '@');
        $insta = $conn->real_escape_string($insta);

        if ($uid) {
            $conn->query("UPDATE users SET name='$name', phone='$phone' WHERE id=$uid");

            if ($insta) {
                $conn->query("INSERT INTO user_socials (user_id, platform, handle)
                              VALUES ($uid, 'instagram', '$insta')
                              ON DUPLICATE KEY UPDATE handle='$insta'");
            } else {
                $conn->query("DELETE FROM user_socials WHERE user_id=$uid AND platform='instagram'");
            }
            echo json_encode(["status" => "success"]);
        } else {
            echo json_encode(["error" => "Invalid user id"]);
        }
        exit;
    }

    // ── DELETE USER ─────────────────────────────────────────────────────────────
    if ($action === 'delete_user') {
        $id = (int)($body['id'] ?? 0);
        $conn->query("DELETE FROM users WHERE id=$id");
        echo json_encode(["status" => "ok"]);
        exit;
    }
}

if ($method === 'GET') {

    // ── GET PROFILE ─────────────────────────────────────────────────────────────
    if ($action === 'get_profile') {
        $id  = (int)($_GET['id'] ?? 0);
        $res = $conn->query(
            "SELECT u.*, us.handle AS instagram_id
             FROM users u
             LEFT JOIN user_socials us ON u.id = us.user_id AND us.platform = 'instagram'
             WHERE u.id=$id"
        );
        $user = $res->fetch_assoc();
        if ($user) unset($user['password']);
        echo json_encode($user);
        exit;
    }

    // ── GET USERS (Admin) ────────────────────────────────────────────────────────
    if ($action === 'get_users') {
        $res  = $conn->query("SELECT id, name, email, role, phone, created_at FROM users ORDER BY id ASC");
        $data = [];
        while ($r = $res->fetch_assoc()) $data[] = $r;
        echo json_encode($data);
        exit;
    }
}

echo json_encode(["error" => "Invalid request"]);
?>
