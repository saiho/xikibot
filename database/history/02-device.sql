CREATE TABLE ComponentHistory (
    persistentId INTEGER,
    z2mDeviceId TEXT NOT NULL,
    name TEXT,
    sinceDate INTEGER,
    presence INTEGER NOT NULL,
    PRIMARY KEY (persistentId, sinceDate))
    STRICT;

CREATE VIEW CurrentComponent AS
SELECT persistentId, z2mDeviceId, name, sinceDate, presence
FROM ComponentHistory DH1
WHERE sinceDate = (
    SELECT MAX(DH2.sinceDate)
    FROM ComponentHistory DH2
    WHERE DH1.persistentId = DH2.persistentId);

INSERT INTO ComponentHistory VALUES
  (101,'0xa4c138032aadb578','Ventilador aseo y garaje',1760220000000,1),
  (102,'0x00047400002aae1c','Ventilador baño arriba',1760220000000,1),
  (103,'0x282c02bfffebb79e','Sensor temperatura garaje',1760220000000,1),
  (104,'0xf44250000c400000','Sensor temperatura ático',1760220000000,1),
  (105,'0x282c02bfffee5466','Sensor temperatura exterior',1760220000000,1),
  (106,'0xf44250001e7b0000','Sensor temperatura baño arriba',1760220000000,1),
  (107,'0x282c02bfffee4be1','Sensor temperatura habitación roja',1760220000000,1),
  (108,'0xffffb40e0600d41f','Sensor temperatura salón',1760220000000,1);

ALTER TABLE TemperatureHumidity RENAME TO TemperatureHumidityOld;
ALTER TABLE FanState RENAME TO FanStateOld;
DROP VIEW CurrentFanState;

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

CREATE VIEW CurrentFanState AS
SELECT persistentId, measureDate, level
FROM FanState FS1
WHERE measureDate = (
    SELECT MAX(FS2.measureDate)
    FROM FanState FS2
    WHERE FS1.persistentId = FS2.persistentId);

INSERT INTO TemperatureHumidity
SELECT
    persistentId,
    measureDate,
    temperature,
    humidity
FROM TemperatureHumidityOld
LEFT JOIN ComponentHistory ON TemperatureHumidityOld.deviceId = ComponentHistory.z2mDeviceId;

INSERT INTO FanState
SELECT
    persistentId,
    measureDate,
    level
FROM FanStateOld
LEFT JOIN ComponentHistory ON FanStateOld.deviceId = ComponentHistory.z2mDeviceId;

DROP TABLE TemperatureHumidityOld;
DROP TABLE FanStateOld;
