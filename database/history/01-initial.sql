CREATE TABLE TemperatureHumidity (
    deviceId TEXT,
    measureDate INTEGER,
    temperature REAL,
    humidity REAL,
    PRIMARY KEY (deviceId, measureDate))
    STRICT;

CREATE TABLE FanState (
    deviceId TEXT,
    measureDate INTEGER,
    level INTEGER,
    PRIMARY KEY (deviceId, measureDate))
    STRICT;

CREATE VIEW CurrentFanState AS
SELECT deviceId, measureDate, level
FROM FanState FS1
WHERE measureDate = (
    SELECT MAX(FS2.measureDate)
    FROM FanState FS2
    WHERE FS1.deviceId = FS2.deviceId);
