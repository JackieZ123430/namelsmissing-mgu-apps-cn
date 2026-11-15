# Light Flasher 0.1.6

## 0.1.6 – Autostart passive monitor and simulation timings

MGU Store builds now carry mguAppStartType=autostart in both archives using the existing scoped startup packaging helper. This starts the OAP app process, not a separate systemd service, without requiring the menu to be opened (actual vehicle boot behavior still needs verification). Background status monitor is enabled by default and can be switched off. It observes the already subscribed combined OEM light status only while the existing stationary/P guard is valid; no background UDS reads, no automatic flash trigger, no changes to vehicle lights. The combined signal still cannot distinguish a lever pull from sustained high beam. The JSON export includes app start reason, start time, first visible MAIN time and bounded status-transition samples. The status line shows observations before first opening; zero observations alone does not establish that autostart failed. No radio button action is implemented.

Existing 20/40/60/80 ms choices are newly available for text simulation only. Physical tests reject these settings rather than silently clamp them. Existing 100 ms and above remain requested intervals, not guaranteed physical timing; serialized TASU requests and mandatory STOP/cleanup prevent accurate sub-100 ms actuation. No change to physical actuation behavior, foreground guard or OEM suppression readiness.



## 0.1.5 – Manual pattern uses saved settings

Start flash pattern uses the same persisted pattern, interval and hold keys as the preview; the existing hold value is now the manual flash duration (2–5 seconds). Preview pattern -> Flash pattern; Preview step interval -> Requested step interval; Preview hold threshold -> Flash duration. Both use a common configuration validator. Alternate, double, triple and both are supported; each pulse is bounded by the existing one-second ECU timer. Starts are serialized, STOP precedes the next step and at least a requested 150 ms dark gap is inserted. The interval is a requested minimum step time, not guaranteed physical flash timing. Both sides are not exactly simultaneous. New starts cease at the duration deadline, cleanup may run longer. A preflight reads both channel-8 PWM/current values and requires both OFF. A persistent marker prevents further manual tests after unconfirmed cleanup or interrupted execution. No activation on launch/bookmark, no movement, no suppression of OEM lights, no zero PWM. Use only in P on private property away from other people. No change to Light Show.



## Manual flash (parked one-shot)

Enable manual parked flash in settings (default OFF). With the vehicle securely parked in P, on private property with a clear area in front, keep OEM high beam OFF. Select Flash once on the main screen. The app checks current vehicle speed, P, fresh OEM-off signal and both FLM identities. One short sequential channel-8 pulse per side at 60% uses the existing 1-second ECU routine; STOP and default session are attempted on each side, even on error/cancel. Stop, leaving screen, guard loss and shutdown cancel subsequent starts. Unconfirmed cleanup blocks another run in the same app instance. No zero PWM, OEM suppression, automatic launch/lever trigger, recurring pulses or road use. Physical timing and restoration have not been tested for this app.

The kit marks its app entry point bookmarkable but maps it to the main screen; a favorite button may open Light Flasher (vehicle support unverified). It does not automatically flash. Diagnostics still use read-only requests; manual mode is separate and shares the existing TASU connection.



## 0.1.3 – Verified electrical feedback; OEM priority remains unknown

D6DB decoding uses 15 x 5-byte records: PWM (%), big-endian unsigned current (mA), voltage (V), phase. The latest consistent OFF/ON/OFF vehicle series confirms channel 8 on each side goes 0%/0 mA -> 100%/1000 mA -> 0%/0 mA, while channel 7 remains at 100%. A voltage value of 1 V was observed on one side after switch-off; zero current is not identical to zero voltage. D6DB responses took 269–301 ms (eight reads, mean 290.75 ms). D9FC remained identical. The earlier BDC timeout is separate from the successful FLM reads.

Both original FLM02 PRGs define a timed channel routine and PWM parameter, but do not document arbitration against a normal high-beam request, the effect of zero PWM on that request, or physical restoration after stop/timeout. Existing Light Show deliberately excludes zero PWM. The diagnostic PRG is not ECU firmware. Positive UDS acknowledgment does not demonstrate physical output or restoration. No change to the actuator whitelist or any live suppression control is made. Further authority/restoration validation belongs on an isolated, non-road bench with manufacturer documentation and independent observation. Readback and readiness flags are now included in the log; those flags cannot be changed via settings.



## 0.1.2 – Read-only FLM feedback investigation

Offline inspection of both supplied FLM02 PRGs identifies FLM_KANAL_ERGEBNISSE (D6DB), FLM_FUNKTION_LICHTVERTEILUNG_ERGEBNISSE (D7A7) and FLM_ZUORDNUNG_SENSOREN_KANAELE (D9FC). D6DB includes channel PWM, current and voltage fields; it may reflect diagnostic routine results rather than live OEM output. D7A7 reports function-related feedback. No physical suppression authority or live measurement is assumed. FLM_KANAL has a PWM argument and seconds duration, but a PWM value of zero is not verified to override normal lighting. No suppression or write commands are implemented.

Diagnostics > FLM02 feedback: compare OFF / steady OEM high beam ON / OFF again using the normal vehicle controls in P on private property. Verify both FLM identities before reading the three DIDs on each side. Raw replies and errors, combined status before/after, and per-result timestamps are saved to the normal JSON export. Only service 22 is sent; no session changes, actuator routines or coding.



## 0.1.1 – Explicit connection preflight

The new Check BDC connection button checks F150 identity and reads E3B8 once. Start first runs the same check and begins the 60-second timer only after both succeed. The display distinguishes disabled mode, park guard, TASU unavailable, identity failure, and E3B8 failure. Errors remain visible, and a saved JSON report includes request/response bytes, timings and transport errors even if preflight fails. No new diagnostic services or actuator control are introduced.



Separate experimental ID7 app. **Read-only diagnostics and simulated pattern preview only.** Prior versions had no live flash actuator; current manual parked mode is described above. No lever-triggered effect or background control. The Enable setting controls diagnostic recording.

## Candidate stalk signal

Offline inspection of the supplied BDC_G05 PRG reveals LENKSTOCK_BLINKER / DID E3B8 / RES_0xE3B8_D and separate STAT_FERNLICHT and STAT_LICHTHUPE result descriptions. The response byte/bit mapping is NOT verified. The app reads ECU identity F150 and then E3B8 from BDC address 0x40 in the existing session, with no session changes or actuator commands. Combined Vehicle2 statusMainBeam_headlightFlasher is recorded separately; previous vehicle logs showed it cannot distinguish the two actions. No private diagnostic logs or BMW PRG files are bundled.

Park securely in P on private property, enable diagnostics, start capture, mark neutral, pull/release briefly, pull/release for over three seconds, push for continuous high beam and release lever, then turn high beam off. Mark the transitions, stop/save. Capture is bounded to 60 seconds / 300 events, stops on leaving the page or losing stationary state; read requests serialized and spaced at least 750 ms between starts. Export: app data directory/light-flasher-diagnostics.json. No promise of 100 ms ECU actuation; preview is text only.

Pattern, speed and hold threshold are saved settings for simulation. Original vehicle lights remain under OEM control. Light Show is unchanged.
