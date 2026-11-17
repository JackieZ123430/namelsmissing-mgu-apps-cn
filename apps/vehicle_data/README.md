# Vehicle Data

Reads mileage, service due messages (CBS) and the car's stored service history over SOME/IP
and writes them to `bmw-vehicle-data.json` in the app's data directory
(`/var/opt/public/oap/oap_<uid>/data/`). The BMW AI companion agent (`mgu-ai-agent`, from
`mgu-chatgpt-bridge`) reads that file and hands the values to the private Raspberry Pi
(website tab "Fahrzeug"). Starts with the car (`mguAppStartType: autostart`).

Strictly read-only: no setter fields, no CBS reset, no UDS.

| Value | Interface / field (master catalog) | Read as |
|---|---|---|
| Mileage | `de.bmw.infrastructure.SecureMileage` `mileage.currentMileage` (UInt32), fallback `de.bmw.infrastructure.MileageSupreme` `mileageSupreme` | km |
| Service due | `de.bmw.infotainment.ConditionBasedServicesLegacy` `cBSMessageEngineOil`, `…BrakeFront`, `…BrakeRear`, `…GearOil`, `…ParticleFilter`, `…SparkPlug` | remaining km (UInt16), due date (year = 2000 + UInt8) |
| Service history | `com.harman.infotainment.systemfunctions.servicehistory.ServiceHistory` method `readServiceHistory` (instance `SystemFunctionsServiceHistoryInst1`), event `serviceHistoryUpdated` | date, km, dealer number, services |

The catalog does not state units. The units above are assumptions and are marked
`unverified` in the file until they have been compared once with the cluster and
iDrive's "Service requirements" page. The first raw value of every signal is logged
(`vehicle raw …`) for that comparison.
