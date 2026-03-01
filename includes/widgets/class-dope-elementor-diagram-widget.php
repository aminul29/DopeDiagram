<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;
use Elementor\Icons_Manager;
use Elementor\Repeater;
use Elementor\Widget_Base;

class Dope_Elementor_Diagram_Widget extends Widget_Base {
	public function get_name(): string {
		return 'dope_elementor_flower_diagram';
	}

	public function get_title(): string {
		return esc_html__( 'Dope Flower Diagram', 'dope-elementor-diagram' );
	}

	public function get_icon(): string {
		return 'eicon-sitemap';
	}

	public function get_categories(): array {
		return array( 'general' );
	}

	public function get_keywords(): array {
		return array( 'diagram', 'flower', 'circle', 'hexagon', 'radial' );
	}

	public function get_style_depends(): array {
		return array( 'dope-elementor-diagram-widget' );
	}

	public function get_script_depends(): array {
		return array( 'dope-elementor-diagram-widget' );
	}

	protected function register_controls(): void {
		$this->register_content_controls();
		$this->register_style_controls();
	}

	private function register_content_controls(): void {
		$this->start_controls_section(
			'section_nodes',
			array(
				'label' => esc_html__( 'Nodes', 'dope-elementor-diagram' ),
				'tab'   => Controls_Manager::TAB_CONTENT,
			)
		);

		$circle_repeater = new Repeater();
		$circle_repeater->add_control(
			'title',
			array(
				'label'       => esc_html__( 'Title', 'dope-elementor-diagram' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => esc_html__( 'Circle Node', 'dope-elementor-diagram' ),
				'label_block' => true,
			)
		);
		$circle_repeater->add_control(
			'icon',
			array(
				'label'   => esc_html__( 'Icon', 'dope-elementor-diagram' ),
				'type'    => Controls_Manager::ICONS,
				'default' => array(
					'value'   => 'fas fa-circle',
					'library' => 'fa-solid',
				),
			)
		);
		$circle_repeater->add_control(
			'description',
			array(
				'label' => esc_html__( 'Tooltip Text', 'dope-elementor-diagram' ),
				'type'  => Controls_Manager::TEXTAREA,
			)
		);
		$circle_repeater->add_control(
			'color',
			array(
				'label'   => esc_html__( 'Color', 'dope-elementor-diagram' ),
				'type'    => Controls_Manager::COLOR,
				'default' => '#1F6FE5',
			)
		);
		$circle_repeater->add_control(
			'link',
			array(
				'label'       => esc_html__( 'Link', 'dope-elementor-diagram' ),
				'type'        => Controls_Manager::URL,
				'placeholder' => 'https://example.com',
				'dynamic'     => array(
					'active' => true,
				),
			)
		);

		$this->add_control(
			'circles',
			array(
				'label'       => esc_html__( 'Circles', 'dope-elementor-diagram' ),
				'type'        => Controls_Manager::REPEATER,
				'fields'      => $circle_repeater->get_controls(),
				'default'     => $this->get_default_circles(),
				'title_field' => '{{{ title }}}',
			)
		);

		$hex_repeater = new Repeater();
		$hex_repeater->add_control(
			'title',
			array(
				'label'       => esc_html__( 'Title', 'dope-elementor-diagram' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => esc_html__( 'Hexagon Node', 'dope-elementor-diagram' ),
				'label_block' => true,
			)
		);
		$hex_repeater->add_control(
			'icon',
			array(
				'label'   => esc_html__( 'Icon', 'dope-elementor-diagram' ),
				'type'    => Controls_Manager::ICONS,
				'default' => array(
					'value'   => 'fas fa-cube',
					'library' => 'fa-solid',
				),
			)
		);
		$hex_repeater->add_control(
			'description',
			array(
				'label' => esc_html__( 'Tooltip Text', 'dope-elementor-diagram' ),
				'type'  => Controls_Manager::TEXTAREA,
			)
		);
		$hex_repeater->add_control(
			'color',
			array(
				'label'   => esc_html__( 'Color', 'dope-elementor-diagram' ),
				'type'    => Controls_Manager::COLOR,
				'default' => '#2FA8E8',
			)
		);
		$hex_repeater->add_control(
			'link',
			array(
				'label'       => esc_html__( 'Link', 'dope-elementor-diagram' ),
				'type'        => Controls_Manager::URL,
				'placeholder' => 'https://example.com',
				'dynamic'     => array(
					'active' => true,
				),
			)
		);

		$this->add_control(
			'hexagons',
			array(
				'label'       => esc_html__( 'Hexagons', 'dope-elementor-diagram' ),
				'type'        => Controls_Manager::REPEATER,
				'fields'      => $hex_repeater->get_controls(),
				'default'     => $this->get_default_hexagons(),
				'title_field' => '{{{ title }}}',
			)
		);

		$this->add_control(
			'show_connectors',
			array(
				'label'        => esc_html__( 'Show Connectors', 'dope-elementor-diagram' ),
				'type'         => Controls_Manager::SWITCHER,
				'default'      => 'yes',
				'label_on'     => esc_html__( 'Show', 'dope-elementor-diagram' ),
				'label_off'    => esc_html__( 'Hide', 'dope-elementor-diagram' ),
				'return_value' => 'yes',
			)
		);

		$this->add_control(
			'show_tooltips',
			array(
				'label'        => esc_html__( 'Show Tooltips', 'dope-elementor-diagram' ),
				'type'         => Controls_Manager::SWITCHER,
				'default'      => 'yes',
				'label_on'     => esc_html__( 'Show', 'dope-elementor-diagram' ),
				'label_off'    => esc_html__( 'Hide', 'dope-elementor-diagram' ),
				'return_value' => 'yes',
			)
		);

		$this->end_controls_section();
	}

	private function register_style_controls(): void {
		$this->start_controls_section(
			'section_layout_style',
			array(
				'label' => esc_html__( 'Layout', 'dope-elementor-diagram' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->add_control(
			'container_size',
			array(
				'label'      => esc_html__( 'Container Size', 'dope-elementor-diagram' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array(
					'px' => array(
						'min'  => 420,
						'max'  => 1200,
						'step' => 10,
					),
				),
				'default'    => array(
					'unit' => 'px',
					'size' => 860,
				),
			)
		);

		$this->add_control(
			'circle_size',
			array(
				'label'      => esc_html__( 'Circle Size', 'dope-elementor-diagram' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array(
					'px' => array(
						'min'  => 100,
						'max'  => 260,
						'step' => 2,
					),
				),
				'default'    => array(
					'unit' => 'px',
					'size' => 180,
				),
			)
		);

		$this->add_control(
			'hexagon_size',
			array(
				'label'      => esc_html__( 'Hexagon Size', 'dope-elementor-diagram' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array(
					'px' => array(
						'min'  => 90,
						'max'  => 200,
						'step' => 2,
					),
				),
				'default'    => array(
					'unit' => 'px',
					'size' => 150,
				),
			)
		);

		$this->add_control(
			'circle_radius',
			array(
				'label'      => esc_html__( 'Circle Radius', 'dope-elementor-diagram' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array(
					'px' => array(
						'min'  => 70,
						'max'  => 320,
						'step' => 2,
					),
				),
				'default'    => array(
					'unit' => 'px',
					'size' => 145,
				),
			)
		);

		$this->add_control(
			'hexagon_radius',
			array(
				'label'      => esc_html__( 'Hexagon Radius', 'dope-elementor-diagram' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array(
					'px' => array(
						'min'  => 180,
						'max'  => 480,
						'step' => 2,
					),
				),
				'default'    => array(
					'unit' => 'px',
					'size' => 335,
				),
			)
		);

		$this->add_control(
			'bloom_duration',
			array(
				'label'   => esc_html__( 'Bloom Duration (ms)', 'dope-elementor-diagram' ),
				'type'    => Controls_Manager::NUMBER,
				'min'     => 100,
				'max'     => 2500,
				'step'    => 10,
				'default' => 900,
			)
		);

		$this->add_control(
			'stagger_delay',
			array(
				'label'   => esc_html__( 'Stagger Delay (ms)', 'dope-elementor-diagram' ),
				'type'    => Controls_Manager::NUMBER,
				'min'     => 0,
				'max'     => 500,
				'step'    => 5,
				'default' => 80,
			)
		);

		$this->add_control(
			'connector_color',
			array(
				'label'   => esc_html__( 'Connector Color', 'dope-elementor-diagram' ),
				'type'    => Controls_Manager::COLOR,
				'default' => 'rgba(220, 228, 238, 0.95)',
			)
		);

		$this->end_controls_section();

		$this->start_controls_section(
			'section_typography_style',
			array(
				'label' => esc_html__( 'Typography', 'dope-elementor-diagram' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => 'circle_typography',
				'label'    => esc_html__( 'Circle Title', 'dope-elementor-diagram' ),
				'selector' => '{{WRAPPER}} .ded-node--circle .ded-node-title',
			)
		);

		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => 'hex_typography',
				'label'    => esc_html__( 'Hexagon Title', 'dope-elementor-diagram' ),
				'selector' => '{{WRAPPER}} .ded-node--hexagon .ded-node-title',
			)
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		$settings = $this->get_settings_for_display();

		$circles  = $this->sanitize_nodes( is_array( $settings['circles'] ?? null ) ? $settings['circles'] : array(), '#1F6FE5' );
		$hexagons = $this->sanitize_nodes( is_array( $settings['hexagons'] ?? null ) ? $settings['hexagons'] : array(), '#2FA8E8' );

		$show_connectors_raw = $settings['show_connectors'] ?? '';
		$show_connectors     = false;
		if ( is_bool( $show_connectors_raw ) ) {
			$show_connectors = $show_connectors_raw;
		} elseif ( is_string( $show_connectors_raw ) ) {
			$show_connectors = '' !== $show_connectors_raw && 'no' !== strtolower( $show_connectors_raw );
		} elseif ( ! empty( $show_connectors_raw ) ) {
			$show_connectors = true;
		}
		$show_tooltips   = 'yes' === ( $settings['show_tooltips'] ?? '' );

		$container_size = $this->sanitize_range( $settings['container_size']['size'] ?? 860, 420, 1200, 860 );
		$circle_size    = $this->sanitize_range( $settings['circle_size']['size'] ?? 180, 100, 260, 180 );
		$hexagon_size   = $this->sanitize_range( $settings['hexagon_size']['size'] ?? 150, 90, 200, 150 );
		$circle_radius  = $this->sanitize_range( $settings['circle_radius']['size'] ?? 145, 70, 320, 145 );
		$hexagon_radius = $this->sanitize_range( $settings['hexagon_radius']['size'] ?? 335, 180, 480, 335 );

		$bloom_duration = $this->sanitize_range( $settings['bloom_duration'] ?? 900, 100, 2500, 900 );
		$stagger_delay  = $this->sanitize_range( $settings['stagger_delay'] ?? 80, 0, 500, 80 );

		$connector_color = $this->sanitize_color_rgba( $settings['connector_color'] ?? 'rgba(220, 228, 238, 0.95)', 'rgba(220, 228, 238, 0.95)' );

		$config = array(
			'showTooltips'  => $show_tooltips,
			'showConnectors' => $show_connectors,
			'bloomDuration' => $bloom_duration,
			'staggerDelay'  => $stagger_delay,
		);

		$wrapper_style = sprintf(
			'--ded-container-size:%1$spx;--ded-circle-size:%2$spx;--ded-hexagon-size:%3$spx;--ded-circle-radius:%4$spx;--ded-hexagon-radius:%5$spx;--ded-bloom-duration:%6$sms;--ded-connector-color:%7$s;',
			esc_attr( (string) $container_size ),
			esc_attr( (string) $circle_size ),
			esc_attr( (string) $hexagon_size ),
			esc_attr( (string) $circle_radius ),
			esc_attr( (string) $hexagon_radius ),
			esc_attr( (string) $bloom_duration ),
			esc_attr( $connector_color )
		);

		$circle_count = count( $circles );
		$hex_count    = count( $hexagons );
		?>
		<div class="ded-diagram" style="<?php echo $wrapper_style; ?>" data-ded-config="<?php echo esc_attr( wp_json_encode( $config ) ); ?>">
			<div class="ded-diagram__canvas" role="img" aria-label="<?php esc_attr_e( 'Flower diagram with circles and hexagons', 'dope-elementor-diagram' ); ?>">
				<?php if ( $show_connectors ) : ?>
				<svg class="ded-connectors-svg" aria-hidden="true" focusable="false"></svg>
				<?php endif; ?>

				<div class="ded-layer ded-layer--circles">
					<?php foreach ( $circles as $index => $circle ) : ?>
						<?php
						$angle = $this->compute_angle( $index, $circle_count );
						$delay = $index * $stagger_delay;
						$this->render_node( $circle, 'circle', $index, $angle, 'var(--ded-circle-radius)', $delay, $show_tooltips );
						?>
					<?php endforeach; ?>
				</div>

				<div class="ded-layer ded-layer--hexagons">
					<?php foreach ( $hexagons as $index => $hexagon ) : ?>
						<?php
						$angle = $this->compute_angle( $index, $hex_count );
						$delay = ( $circle_count + $index ) * $stagger_delay;
						$this->render_node( $hexagon, 'hexagon', $index, $angle, 'var(--ded-hexagon-radius)', $delay, $show_tooltips );
						?>
					<?php endforeach; ?>
				</div>

				<div class="ded-center-dot" aria-hidden="true"></div>
			</div>
		</div>
		<?php
	}

	private function render_node( array $node, string $type, int $index, float $angle, string $radius, int $delay, bool $show_tooltips ): void {
		$node_class  = 'ded-node ded-node--' . $type;
		$shape_class = 'ded-node-shape';
		$style       = sprintf(
			'--ded-angle:%1$sdeg;--ded-radius:%2$s;--ded-delay:%3$sms;--ded-node-color:%4$s;',
			esc_attr( (string) $angle ),
			esc_attr( $radius ),
			esc_attr( (string) $delay ),
			esc_attr( $node['color'] )
		);

		$tooltip = '';
		if ( $show_tooltips && ! empty( $node['description'] ) ) {
			$tooltip = $node['description'];
		}
		?>
		<div class="<?php echo esc_attr( $node_class ); ?>" style="<?php echo $style; ?>">
			<?php if ( ! empty( $node['link']['url'] ) ) : ?>
				<?php $rel_attr = $this->build_rel_attribute( $node['link'] ); ?>
				<a
					class="ded-node-link"
					href="<?php echo esc_url( $node['link']['url'] ); ?>"
					<?php echo ! empty( $node['link']['is_external'] ) ? 'target="_blank"' : ''; ?>
					<?php if ( '' !== $rel_attr ) : ?>
					rel="<?php echo esc_attr( $rel_attr ); ?>"
					<?php endif; ?>
					data-type="<?php echo esc_attr( $type ); ?>"
					data-index="<?php echo esc_attr( (string) $index ); ?>"
					<?php if ( '' !== $tooltip ) : ?>
					data-tooltip="<?php echo esc_attr( $tooltip ); ?>"
					<?php endif; ?>
				>
					<div class="<?php echo esc_attr( $shape_class ); ?>">
						<div class="ded-node-content">
							<?php $this->render_node_icon( $node['icon'] ); ?>
							<span class="ded-node-title"><?php echo esc_html( $node['title'] ); ?></span>
						</div>
					</div>
				</a>
			<?php else : ?>
				<div
					class="ded-node-link ded-node-link--static"
					tabindex="0"
					data-type="<?php echo esc_attr( $type ); ?>"
					data-index="<?php echo esc_attr( (string) $index ); ?>"
					<?php if ( '' !== $tooltip ) : ?>
					data-tooltip="<?php echo esc_attr( $tooltip ); ?>"
					<?php endif; ?>
				>
					<div class="<?php echo esc_attr( $shape_class ); ?>">
						<div class="ded-node-content">
							<?php $this->render_node_icon( $node['icon'] ); ?>
							<span class="ded-node-title"><?php echo esc_html( $node['title'] ); ?></span>
						</div>
					</div>
				</div>
			<?php endif; ?>
		</div>
		<?php
	}

	private function render_node_icon( array $icon ): void {
		if ( empty( $icon['value'] ) ) {
			return;
		}

		echo '<span class="ded-node-icon" aria-hidden="true">';
		Icons_Manager::render_icon( $icon, array( 'aria-hidden' => 'true' ) );
		echo '</span>';
	}

	private function build_rel_attribute( array $link ): string {
		$rels = array();
		if ( ! empty( $link['is_external'] ) ) {
			$rels[] = 'noopener';
			$rels[] = 'noreferrer';
		}
		if ( ! empty( $link['nofollow'] ) ) {
			$rels[] = 'nofollow';
		}

		return implode( ' ', array_unique( $rels ) );
	}

	private function sanitize_nodes( array $nodes, string $fallback_color ): array {
		$sanitized = array();

		foreach ( $nodes as $node ) {
			$title = sanitize_text_field( (string) ( $node['title'] ?? '' ) );
			if ( '' === $title ) {
				continue;
			}

			$description = sanitize_textarea_field( (string) ( $node['description'] ?? '' ) );
			$color       = sanitize_hex_color( (string) ( $node['color'] ?? '' ) );
			$color       = $color ? $color : $fallback_color;

			$icon_value = '';
			$icon_lib   = 'fa-solid';
			if ( isset( $node['icon'] ) && is_array( $node['icon'] ) ) {
				$icon_value = sanitize_text_field( (string) ( $node['icon']['value'] ?? '' ) );
				$icon_lib   = sanitize_text_field( (string) ( $node['icon']['library'] ?? 'fa-solid' ) );
			}

			$link = array(
				'url'         => '',
				'is_external' => false,
				'nofollow'    => false,
			);
			if ( isset( $node['link'] ) && is_array( $node['link'] ) ) {
				$link['url']         = esc_url_raw( (string) ( $node['link']['url'] ?? '' ) );
				$link['is_external'] = ! empty( $node['link']['is_external'] );
				$link['nofollow']    = ! empty( $node['link']['nofollow'] );
			}

			$sanitized[] = array(
				'title'       => $title,
				'description' => $description,
				'color'       => $color,
				'icon'        => array(
					'value'   => $icon_value,
					'library' => $icon_lib,
				),
				'link'        => $link,
			);
		}

		return $sanitized;
	}

	private function sanitize_range( $value, int $min, int $max, int $default ): int {
		$numeric = is_numeric( $value ) ? (int) $value : $default;
		if ( $numeric < $min ) {
			return $min;
		}

		if ( $numeric > $max ) {
			return $max;
		}

		return $numeric;
	}

	private function sanitize_color_rgba( string $value, string $default ): string {
		$trimmed = trim( $value );
		if ( '' === $trimmed ) {
			return $default;
		}

		$hex = sanitize_hex_color( $trimmed );
		if ( $hex ) {
			return $hex;
		}

		if ( 1 === preg_match( '/^rgba?\(\s*([0-9]{1,3}\s*,\s*){2}[0-9]{1,3}(\s*,\s*(0|0?\.[0-9]+|1))?\s*\)$/', $trimmed ) ) {
			return $trimmed;
		}

		return $default;
	}

	private function compute_angle( int $index, int $count ): float {
		if ( $count <= 0 ) {
			return -90.0;
		}

		return -90.0 + ( 360.0 / $count ) * $index;
	}

	private function get_default_circles(): array {
		return array(
			array(
				'title'       => 'Research',
				'icon'        => array(
					'value'   => 'fas fa-flask',
					'library' => 'fa-solid',
				),
				'description' => 'Evidence generation and experimentation for informed decisions.',
				'color'       => '#1F6FE5',
			),
			array(
				'title'       => 'Innovation Programming',
				'icon'        => array(
					'value'   => 'fas fa-lightbulb',
					'library' => 'fa-solid',
				),
				'description' => 'Design and delivery of adaptive innovation programs.',
				'color'       => '#2AA9E6',
			),
			array(
				'title'       => 'Capacity Development',
				'icon'        => array(
					'value'   => 'fas fa-graduation-cap',
					'library' => 'fa-solid',
				),
				'description' => 'Strengthening institutional and individual capabilities.',
				'color'       => '#4C9DE8',
			),
			array(
				'title'       => 'Stakeholder Engagement',
				'icon'        => array(
					'value'   => 'fas fa-users',
					'library' => 'fa-solid',
				),
				'description' => 'Inclusive engagement with communities and partners.',
				'color'       => '#3F9748',
			),
			array(
				'title'       => 'Network Building',
				'icon'        => array(
					'value'   => 'fas fa-project-diagram',
					'library' => 'fa-solid',
				),
				'description' => 'Creating cross-sector collaboration networks.',
				'color'       => '#28B3B0',
			),
		);
	}

	private function get_default_hexagons(): array {
		return array(
			array(
				'title'       => 'WEF Nexus Multi-Criteria Scenario-Analysis Tools',
				'icon'        => array(
					'value'   => 'fas fa-chart-line',
					'library' => 'fa-solid',
				),
				'description' => 'Scenario analysis for water-energy-food nexus planning.',
				'color'       => '#5BCF52',
			),
			array(
				'title'       => 'SDG Localization',
				'icon'        => array(
					'value'   => 'fas fa-map-marker-alt',
					'library' => 'fa-solid',
				),
				'description' => 'Context-specific SDG implementation strategies.',
				'color'       => '#5F7D89',
			),
			array(
				'title'       => 'Food System Transformation',
				'icon'        => array(
					'value'   => 'fas fa-utensils',
					'library' => 'fa-solid',
				),
				'description' => 'Resilient and sustainable food system interventions.',
				'color'       => '#2FA8E8',
			),
			array(
				'title'       => 'Energy Transition',
				'icon'        => array(
					'value'   => 'fas fa-bolt',
					'library' => 'fa-solid',
				),
				'description' => 'Decarbonization pathways and energy system shifts.',
				'color'       => '#377FDE',
			),
			array(
				'title'       => 'Artificial Intelligence',
				'icon'        => array(
					'value'   => 'fas fa-robot',
					'library' => 'fa-solid',
				),
				'description' => 'Responsible AI solutions for decision support.',
				'color'       => '#56C857',
			),
			array(
				'title'       => 'Human and Planetary Health',
				'icon'        => array(
					'value'   => 'fas fa-shield-alt',
					'library' => 'fa-solid',
				),
				'description' => 'Integrated approaches for human and ecosystem wellbeing.',
				'color'       => '#2F9485',
			),
			array(
				'title'       => 'WEF Nexus Governance',
				'icon'        => array(
					'value'   => 'fas fa-gavel',
					'library' => 'fa-solid',
				),
				'description' => 'Policy and governance frameworks for nexus management.',
				'color'       => '#3A87DD',
			),
			array(
				'title'       => 'Youth Engagement',
				'icon'        => array(
					'value'   => 'fas fa-child',
					'library' => 'fa-solid',
				),
				'description' => 'Empowering youth leadership and participation.',
				'color'       => '#2A9D95',
			),
			array(
				'title'       => 'Migration',
				'icon'        => array(
					'value'   => 'fas fa-plane',
					'library' => 'fa-solid',
				),
				'description' => 'Data-driven migration policy and adaptation pathways.',
				'color'       => '#5B7784',
			),
			array(
				'title'       => 'Disaster Risk Reduction',
				'icon'        => array(
					'value'   => 'fas fa-exclamation-triangle',
					'library' => 'fa-solid',
				),
				'description' => 'Preparedness and resilience planning for disasters.',
				'color'       => '#27A69F',
			),
		);
	}
}
