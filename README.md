# Dope Elementor Diagram

Elementor widget plugin for rendering a flower-style radial diagram with editable circles and hexagons.

## Features

- Elementor widget: `Dope Flower Diagram`
- Default data preloaded:
  - 5 circle nodes
  - 10 hexagon nodes
- Add, edit, remove circles and hexagons via Elementor repeaters
- Automatic radial positioning for any number of nodes
- Scroll-triggered bloom animation (once)
- Optional connectors and tooltips
- Responsive and keyboard-focusable nodes

## Installation

1. Place plugin in `wp-content/plugins/DopeElementorDiagram`.
2. Activate **Dope Elementor Diagram** in WordPress admin.
3. Ensure Elementor is installed and active.
4. In Elementor editor, add **Dope Flower Diagram** widget.

## Controls

### Content
- `circles` (Repeater)
- `hexagons` (Repeater)
- `show_connectors`
- `show_tooltips`

### Style
- `container_size`
- `circle_size`
- `hexagon_size`
- `circle_radius`
- `hexagon_radius`
- `bloom_duration`
- `stagger_delay`

## Notes

- Icons use Elementor Icons control.
- Bloom animation uses IntersectionObserver and falls back to immediate display.
- `prefers-reduced-motion` disables bloom motion.

