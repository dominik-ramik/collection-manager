<?php
// Allow CORS for development and production
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight OPTIONS request for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- Modular DB connection ---
function get_db_connection($config) {
    $host = $config['host'] ?? '';
    $port = $config['port'] ?? 3306;
    $user = $config['user'] ?? '';
    $pass = $config['pass'] ?? '';
    $db   = $config['database'] ?? '';
    $mysqli = new mysqli($host, $user, $pass, $db, $port);
    if ($mysqli->connect_errno) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed']);
        exit;
    }
    $mysqli->set_charset('utf8');
    return $mysqli;
}

// --- Endpoint dispatcher ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $endpoint = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';
    $input = json_decode(file_get_contents('php://input'), true);
    $dbConfig = $input['db'] ?? [];
    switch ($endpoint) {
        case 'get_collection':
            get_collection($dbConfig);
            break;
        case 'batch_update_identification':
            batch_update_identification($dbConfig);
            break;
        case 'backup_omoccurrences':
            backup_omoccurrences($dbConfig);
            break;
        // ...add more endpoints here...
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Unknown endpoint']);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}

// --- Endpoint: get_collection ---
function get_collection($dbConfig) {
    $db = get_db_connection($dbConfig);
    $sql = "SELECT occid, occurrenceID, family, sciname, scientificNameAuthorship, identifiedBy, dateIdentified, recordedBy, recordNumber, eventDate, country, stateProvince, county FROM omoccurrences";
    $result = $db->query($sql);

    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Query failed']);
        $db->close();
        exit;
    }

    $records = [];
    while ($row = $result->fetch_assoc()) {
        $records[] = $row;
    }
    $result->free();
    $db->close();

    echo json_encode($records);
}

// --- Endpoint: batch_update_identification ---
function batch_update_identification($dbConfig) {
    $input = json_decode(file_get_contents('php://input'), true);
    $db = get_db_connection($dbConfig);

    $occids = isset($input['occids']) && is_array($input['occids']) ? $input['occids'] : [];
    if (empty($occids)) {
        echo json_encode(['error' => 'No occids provided']);
        $db->close();
        exit;
    }

    $fields = [];
    // Always add fields if present, even if empty string (set to NULL)
    if (array_key_exists('family', $input)) {
        $fields[] = "family = " . ($input['family'] !== '' ? "'" . $db->real_escape_string($input['family']) . "'" : "NULL");
    }
    if (array_key_exists('newSciname', $input)) {
        $fields[] = "sciname = " . ($input['newSciname'] !== '' ? "'" . $db->real_escape_string($input['newSciname']) . "'" : "NULL");
    }
    if (array_key_exists('newScientificNameAuthorship', $input)) {
        $fields[] = "scientificNameAuthorship = " . ($input['newScientificNameAuthorship'] !== '' ? "'" . $db->real_escape_string($input['newScientificNameAuthorship']) . "'" : "NULL");
    }
    if (array_key_exists('identifiedBy', $input) && $input['identifiedBy'] !== '__KEEP_UNCHANGED__') {
        $fields[] = "identifiedBy = " . ($input['identifiedBy'] !== '' ? "'" . $db->real_escape_string($input['identifiedBy']) . "'" : "NULL");
    }
    if (array_key_exists('dateIdentified', $input)) {
        $fields[] = "dateIdentified = " . ($input['dateIdentified'] !== '' ? "'" . $db->real_escape_string($input['dateIdentified']) . "'" : "NULL");
    }

    if (empty($fields)) {
        echo json_encode(['error' => 'No fields to update']);
        $db->close();
        exit;
    }

    $occidList = implode(',', array_map('intval', $occids));
    $whereOccids = "occid IN ($occidList)";

    $sql = "UPDATE omoccurrences SET " . implode(', ', $fields) . " WHERE $whereOccids";

    // --- revert: execute SQL normally ---
    $result = $db->query($sql);

    if ($result) {
        $affected = $db->affected_rows;
        echo json_encode([
            'success' => true,
            'message' => "Updated $affected records."
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Batch update failed: ' . $db->error]);
    }
    $db->close();
}

// --- Endpoint: backup_omoccurrences ---
function backup_omoccurrences($dbConfig) {
    $db = get_db_connection($dbConfig);
    $sql = "SELECT * FROM omoccurrences";
    $result = $db->query($sql);

    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Query failed']);
        $db->close();
        exit;
    }

    $fields = [];
    while ($field = $result->fetch_field()) {
        $fields[] = $field->name;
    }

    $rowsCount = 0;
    $sqlDump = "INSERT INTO omoccurrences (" . implode(", ", $fields) . ") VALUES\n";
    $values = [];
    while ($row = $result->fetch_assoc()) {
        $vals = [];
        foreach ($fields as $f) {
            if ($row[$f] === null) {
                $vals[] = "NULL";
            } else {
                $vals[] = "'" . $db->real_escape_string($row[$f]) . "'";
            }
        }
        $values[] = "(" . implode(", ", $vals) . ")";
        $rowsCount++;
    }
    $result->free();

    $sqlDump .= implode(",\n", $values) . ";";
    $db->close();

    // Return the SQL dump for download
    echo json_encode([
        'success' => true,
        'sql' => $sqlDump,
        'message' => "Backup generated for $rowsCount records.",
        'rowCount' => $rowsCount
    ]);
}