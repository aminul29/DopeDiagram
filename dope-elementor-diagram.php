<?php
/**
 * Plugin Name: Dope Elementor Diagram
 * Description: Elementor flower-style diagram widget with editable circles and hexagons.
 * Version: 1.2.14
 * Author: Aminul Islam
 * Text Domain: dope-elementor-diagram
 * Requires Plugins: elementor
 *
 * Elementor tested up to: 3.29.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DOPE_ELEMENTOR_DIAGRAM_VERSION', '1.2.14' );
define( 'DOPE_ELEMENTOR_DIAGRAM_FILE', __FILE__ );
define( 'DOPE_ELEMENTOR_DIAGRAM_PATH', __DIR__ );
define( 'DOPE_ELEMENTOR_DIAGRAM_URL', plugin_dir_url( __FILE__ ) );

require_once DOPE_ELEMENTOR_DIAGRAM_PATH . '/includes/class-dope-elementor-diagram-plugin.php';

Dope_Elementor_Diagram_Plugin::instance();
