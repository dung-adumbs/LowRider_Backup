; Repair pass: redraw only the two positive-X inset crosshairs
; Uses the unchanged work coordinate zero from the original square test.
; Pen-down Z = -0.5 mm; travel Z = +5 mm.

G21
G90
G1 Z5 F300

; Lower-right crosshair center: X469.4544 Y80.5456
G1 X466.4544 Y80.5456 F3000
G1 Z-0.5 F300
G1 X472.4544 Y80.5456 F1200
G1 Z5 F300
G1 X469.4544 Y77.5456 F3000
G1 Z-0.5 F300
G1 X469.4544 Y83.5456 F1200
G1 Z5 F300

; Upper-right crosshair center: X469.4544 Y469.4544
G1 X466.4544 Y469.4544 F3000
G1 Z-0.5 F300
G1 X472.4544 Y469.4544 F1200
G1 Z5 F300
G1 X469.4544 Y466.4544 F3000
G1 Z-0.5 F300
G1 X469.4544 Y472.4544 F1200
G1 Z5 F300

M400
