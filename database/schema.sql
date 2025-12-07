CREATE TABLE TemperatureHumidity (
    persistentId INTEGER,
    measureDate INTEGER,
    temperature REAL,
    humidity REAL,
    PRIMARY KEY (persistentId, measureDate))
    STRICT;

CREATE TABLE FanState (
    persistentId INTEGER,
    measureDate INTEGER,
    level INTEGER,
    PRIMARY KEY (persistentId, measureDate))
    STRICT;

CREATE TABLE ComponentHistory (
    persistentId INTEGER,
    z2mDeviceId TEXT NOT NULL,
    name TEXT,
    sinceDate INTEGER,
    presence INTEGER NOT NULL,
    PRIMARY KEY (persistentId, sinceDate))
    STRICT;

CREATE VIEW CurrentFanState AS
SELECT persistentId, measureDate, level
FROM FanState FS1
WHERE measureDate = (
    SELECT MAX(FS2.measureDate)
    FROM FanState FS2
    WHERE FS1.persistentId = FS2.persistentId);

CREATE VIEW CurrentComponent AS
SELECT persistentId, z2mDeviceId, name, sinceDate, presence
FROM ComponentHistory DH1
WHERE sinceDate = (
    SELECT MAX(DH2.sinceDate)
    FROM ComponentHistory DH2
    WHERE DH1.persistentId = DH2.persistentId);
