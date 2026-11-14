# Light Flasher 0.1.2

## 0.1.2 – Read-only FLM feedback investigation

Offline inspection of both supplied FLM02 PRGs identifies FLM_KANAL_ERGEBNISSE (D6DB), FLM_FUNKTION_LICHTVERTEILUNG_ERGEBNISSE (D7A7) and FLM_ZUORDNUNG_SENSOREN_KANAELE (D9FC). D6DB includes channel PWM, current and voltage fields; it may reflect diagnostic routine results rather than live OEM output. D7A7 reports function-related feedback. No physical suppression authority or live measurement is assumed. FLM_KANAL has a PWM argument and seconds duration, but a PWM value of zero is not verified to override normal lighting. No suppression or write commands are implemented.

Diagnostics > FLM02 feedback: compare OFF / steady OEM high beam ON / OFF again using the normal vehicle controls in P on private property. Verify both FLM identities before reading the three DIDs on each side. Raw replies and errors, combined status before/after, and per-result timestamps are saved to the normal JSON export. Only service 22 is sent; no session changes, actuator routines or coding.



## 0.1.1 – Explicit connection preflight

The new Check BDC connection button checks F150 identity and reads E3B8 once. Start first runs the same check and begins the 60-second timer only after both succeed. The display distinguishes disabled mode, park guard, TASU unavailable, identity failure, and E3B8 failure. Errors remain visible, and a saved JSON report includes request/response bytes, timings and transport errors even if preflight fails. No new diagnostic services or actuator control are introduced.



Separate experimental ID7 app. **Read-only diagnostics and simulated pattern preview only.** No live flash actuator, no lever-triggered effect, no background control. The Enable setting controls diagnostic recording.

## Candidate stalk signal

Offline inspection of the supplied BDC_G05 PRG reveals LENKSTOCK_BLINKER / DID E3B8 / RES_0xE3B8_D and separate STAT_FERNLICHT and STAT_LICHTHUPE result descriptions. The response byte/bit mapping is NOT verified. The app reads ECU identity F150 and then E3B8 from BDC address 0x40 in the existing session, with no session changes or actuator commands. Combined Vehicle2 statusMainBeam_headlightFlasher is recorded separately; previous vehicle logs showed it cannot distinguish the two actions. No private diagnostic logs or BMW PRG files are bundled.

Park securely in P on private property, enable diagnostics, start capture, mark neutral, pull/release briefly, pull/release for over three seconds, push for continuous high beam and release lever, then turn high beam off. Mark the transitions, stop/save. Capture is bounded to 60 seconds / 300 events, stops on leaving the page or losing stationary state; read requests serialized and spaced at least 750 ms between starts. Export: app data directory/light-flasher-diagnostics.json. No promise of 100 ms ECU actuation; preview is text only.

Pattern, speed and hold threshold are saved settings for simulation. Original vehicle lights remain under OEM control. Light Show is unchanged.
