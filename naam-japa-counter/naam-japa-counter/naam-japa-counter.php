<?php
/**
 * Plugin Name:       Naam Japa Counter
 * Description:       A free online naam japa and mantra counter with a mala ring, per-mantra songs that play while you tap, and home-screen install. Add it to any page with the shortcode [naam_japa_counter].
 * Version:           1.1.1
 * Requires at least: 5.8
 * Requires PHP:      7.2
 * License:           GPL-2.0-or-later
 * Text Domain:       naam-japa-counter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NJC_VERSION', '1.1.1' );
define( 'NJC_URL', plugin_dir_url( __FILE__ ) );

/* ------------------------------------------------------------------ settings helpers */

/**
 * One song per line:  words to match | label shown to visitors | audio file URL
 * The words are matched against the mantra name, so "ram" also catches "Jai Shri Ram".
 */
function njc_default_tracks() {
	return "radha, radhe, राधा | Radha Naam | https://allchalisaall.b-cdn.net/%E0%A4%B0%E0%A4%BE%E0%A4%A7%E0%A4%BE%20%E0%A4%A8%E0%A4%BE%E0%A4%AE%20%E0%A4%AA%E0%A5%81%E0%A4%95%E0%A4%BE%E0%A4%B0!%20Shri%20Hit%20Premanand%20Govind%20Sharan%20Ji%20Maharaj.mp3\n"
		. 'ram, raam, rama, राम | Ram Naam | https://allchalisaall.b-cdn.net/Lord%20Hanuman%20Ram%20Naam%20Mantra%20Chanting%20108%20Times%208D%20Audio%20LOFIXPERSON.mp3';
}

function njc_parse_tracks( $raw ) {
	$tracks = array();
	foreach ( preg_split( '/\r\n|\r|\n/', (string) $raw ) as $line ) {
		$parts = array_map( 'trim', explode( '|', $line ) );
		if ( count( $parts ) < 3 ) {
			continue;
		}
		$url = esc_url_raw( $parts[2], array( 'http', 'https' ) );
		if ( '' === $parts[0] || '' === $url ) {
			continue;
		}
		$tracks[] = array(
			'match' => $parts[0],
			'label' => $parts[1],
			'url'   => $url,
		);
		if ( count( $tracks ) >= 20 ) {
			break;
		}
	}
	return $tracks;
}

function njc_get_tracks() {
	return njc_parse_tracks( get_option( 'njc_tracks', njc_default_tracks() ) );
}

function njc_idle_seconds() {
	$n = absint( get_option( 'njc_idle', 3 ) );
	return max( 1, min( 30, $n ? $n : 3 ) );
}

function njc_pwa_on() {
	return (bool) apply_filters( 'njc_enable_pwa', 1 === absint( get_option( 'njc_pwa', 1 ) ) );
}

function njc_page_has_counter() {
	if ( ! is_singular() ) {
		return false;
	}
	$post = get_post();
	return $post && has_shortcode( $post->post_content, 'naam_japa_counter' );
}

/* ------------------------------------------------------------------ assets */

function njc_register_assets() {
	wp_register_style( 'njc', NJC_URL . 'assets/njc.css', array(), NJC_VERSION );
	wp_register_script(
		'njc',
		NJC_URL . 'assets/njc.js',
		array(),
		NJC_VERSION,
		array(
			'in_footer' => true,
			'strategy'  => 'defer',
		)
	);

	if ( njc_page_has_counter() ) {
		wp_enqueue_style( 'njc' );
		wp_enqueue_script( 'njc' );
	}
}
add_action( 'wp_enqueue_scripts', 'njc_register_assets' );

/* ------------------------------------------------------------------ shortcode */

/**
 * [naam_japa_counter]
 * [naam_japa_counter mantra="Radha" target="108"]
 *
 * mantra: opens this mantra by default on the page (created if it does not exist yet).
 * target: round length for a newly created mantra. Default 108.
 */
function njc_shortcode( $atts ) {
	static $schema_done = false;

	$atts = shortcode_atts(
		array(
			'mantra' => '',
			'target' => '108',
		),
		$atts,
		'naam_japa_counter'
	);

	wp_enqueue_style( 'njc' );
	wp_enqueue_script( 'njc' );

	$target = absint( $atts['target'] );
	if ( $target < 1 ) {
		$target = 108;
	}
	$target = min( $target, 100000 );

	$extra = '';
	if ( njc_pwa_on() ) {
		$permalink = get_permalink();
		$scope     = $permalink ? wp_parse_url( $permalink, PHP_URL_PATH ) : '/';
		$extra     = ' data-sw="' . esc_url( home_url( '/?njc=sw&v=' . NJC_VERSION ) ) . '" data-sw-scope="' . esc_attr( $scope ? $scope : '/' ) . '"';
	}

	$out  = '<div class="njc" data-njc-root data-theme="dark"';
	$out .= ' data-mantra="' . esc_attr( $atts['mantra'] ) . '"';
	$out .= ' data-target="' . esc_attr( $target ) . '"';
	$out .= ' data-idle="' . esc_attr( njc_idle_seconds() ) . '"';
	$out .= ' data-tracks="' . esc_attr( wp_json_encode( njc_get_tracks() ) ) . '"';
	$out .= $extra . '>';
	$out .= '<noscript><p>This counter needs JavaScript. Please turn it on in your browser to use it.</p></noscript>';
	$out .= '</div>';

	if ( ! $schema_done && apply_filters( 'njc_output_schema', true ) ) {
		$schema_done = true;
		$schema      = array(
			'@context'            => 'https://schema.org',
			'@type'               => 'WebApplication',
			'name'                => wp_strip_all_tags( get_the_title() ),
			'url'                 => get_permalink(),
			'description'         => 'Free online naam japa and mantra counter with 108 mala rounds, separate counts per mantra, undo and daily streak.',
			'applicationCategory' => 'LifestyleApplication',
			'operatingSystem'     => 'Any',
			'browserRequirements' => 'Requires JavaScript',
			'inLanguage'          => 'en',
			'offers'              => array(
				'@type'         => 'Offer',
				'price'         => '0',
				'priceCurrency' => 'INR',
			),
		);
		$out .= '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>';
	}

	return $out;
}
add_shortcode( 'naam_japa_counter', 'njc_shortcode' );

/* ------------------------------------------------------------------ install-to-home-screen (PWA) */

function njc_head_tags() {
	if ( ! njc_pwa_on() || ! njc_page_has_counter() ) {
		return;
	}
	echo '<link rel="manifest" href="' . esc_url( home_url( '/?njc=manifest&p=' . (int) get_queried_object_id() ) ) . '">' . "\n";
	echo '<link rel="apple-touch-icon" href="' . esc_url( NJC_URL . 'assets/icons/apple-touch-icon.png' ) . '">' . "\n";
	echo '<meta name="apple-mobile-web-app-title" content="Naam Jap">' . "\n";
}
add_action( 'wp_head', 'njc_head_tags', 5 );

/**
 * Serves the manifest and the service worker from query-string URLs, so they work
 * on any host without rewrite rules or file permissions.
 */
function njc_serve_special() {
	if ( ! isset( $_GET['njc'] ) || ! njc_pwa_on() ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	$what = sanitize_key( wp_unslash( $_GET['njc'] ) ); // phpcs:ignore WordPress.Security.NonceVerification
	if ( 'sw' === $what ) {
		njc_serve_sw();
	} elseif ( 'manifest' === $what ) {
		njc_serve_manifest();
	}
}
add_action( 'init', 'njc_serve_special', 1 );

function njc_serve_manifest() {
	$id  = isset( $_GET['p'] ) ? absint( $_GET['p'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
	$url = home_url( '/' );
	if ( $id ) {
		$post = get_post( $id );
		if ( $post && 'publish' === $post->post_status && has_shortcode( $post->post_content, 'naam_japa_counter' ) ) {
			$url = get_permalink( $post );
		}
	}
	$scope = wp_parse_url( $url, PHP_URL_PATH );
	if ( ! $scope ) {
		$scope = '/';
	}
	$icons = NJC_URL . 'assets/icons/';
	$data  = array(
		'id'               => $url,
		'name'             => 'Naam Japa Counter',
		'short_name'       => 'Naam Jap',
		'description'      => 'Free naam japa and mantra counter with a mala ring, streaks and songs that play while you tap.',
		'start_url'        => $url,
		'scope'            => $scope,
		'display'          => 'standalone',
		'orientation'      => 'portrait',
		'background_color' => '#160d33',
		'theme_color'      => '#160d33',
		'lang'             => 'en',
		'icons'            => array(
			array(
				'src'   => $icons . 'icon-192.png',
				'sizes' => '192x192',
				'type'  => 'image/png',
			),
			array(
				'src'   => $icons . 'icon-512.png',
				'sizes' => '512x512',
				'type'  => 'image/png',
			),
			array(
				'src'     => $icons . 'icon-512-maskable.png',
				'sizes'   => '512x512',
				'type'    => 'image/png',
				'purpose' => 'maskable',
			),
		),
	);
	nocache_headers();
	header( 'Content-Type: application/manifest+json; charset=utf-8' );
	header( 'Cache-Control: public, max-age=3600' );
	echo wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); // phpcs:ignore WordPress.Security.EscapeOutput
	exit;
}

function njc_serve_sw() {
	$js = <<<'JS'
/* Naam Japa Counter service worker */
var VER = 'njc-__VER__';
var ASSETS = '__ASSETS__';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
	e.waitUntil(
		caches.keys().then(function (keys) {
			return Promise.all(keys.filter(function (k) { return k.indexOf('njc-') === 0 && k !== VER; }).map(function (k) { return caches.delete(k); }));
		}).then(function () { return self.clients.claim(); })
	);
});

self.addEventListener('fetch', function (e) {
	var req = e.request;
	if (req.method !== 'GET') { return; }
	var url = new URL(req.url);
	if (url.origin !== self.location.origin) { return; }
	if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
	if (req.url.indexOf(ASSETS) === 0) { e.respondWith(cacheFirst(req)); }
});

function networkFirst(req) {
	var done = false;
	return caches.open(VER).then(function (cache) {
		return new Promise(function (resolve, reject) {
			var timer = setTimeout(function () {
				cache.match(req).then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
			}, 4000);
			fetch(req).then(function (res) {
				clearTimeout(timer);
				if (res && res.ok && res.type === 'basic' && !res.redirected) { cache.put(req, res.clone()); }
				if (!done) { done = true; resolve(res); }
			}).catch(function () {
				clearTimeout(timer);
				cache.match(req).then(function (hit) {
					if (done) { return; }
					done = true;
					if (hit) { resolve(hit); } else { reject(new Error('offline')); }
				});
			});
		});
	});
}

function cacheFirst(req) {
	return caches.open(VER).then(function (cache) {
		return cache.match(req).then(function (hit) {
			return hit || fetch(req).then(function (res) {
				if (res && res.ok) { cache.put(req, res.clone()); }
				return res;
			});
		});
	});
}
JS;
	$js = str_replace( array( '__VER__', '__ASSETS__' ), array( NJC_VERSION, NJC_URL . 'assets/' ), $js );
	nocache_headers();
	header( 'Content-Type: application/javascript; charset=utf-8' );
	header( 'Service-Worker-Allowed: /' );
	echo $js; // phpcs:ignore WordPress.Security.EscapeOutput
	exit;
}

/* ------------------------------------------------------------------ settings page */

function njc_sanitize_tracks( $value ) {
	return sanitize_textarea_field( (string) $value );
}

function njc_sanitize_idle( $value ) {
	return max( 1, min( 30, absint( $value ) ) );
}

function njc_register_settings() {
	register_setting(
		'njc',
		'njc_tracks',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'njc_sanitize_tracks',
			'default'           => njc_default_tracks(),
		)
	);
	register_setting(
		'njc',
		'njc_idle',
		array(
			'type'              => 'integer',
			'sanitize_callback' => 'njc_sanitize_idle',
			'default'           => 3,
		)
	);
	register_setting(
		'njc',
		'njc_pwa',
		array(
			'type'              => 'integer',
			'sanitize_callback' => 'absint',
			'default'           => 1,
		)
	);
}
add_action( 'admin_init', 'njc_register_settings' );

function njc_add_settings_menu() {
	add_options_page( 'Naam Japa Counter', 'Naam Japa Counter', 'manage_options', 'njc', 'njc_settings_page' );
}
add_action( 'admin_menu', 'njc_add_settings_menu' );

function njc_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	?>
	<div class="wrap">
		<h1>Naam Japa Counter</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'njc' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="njc_tracks">Songs</label></th>
					<td>
						<textarea id="njc_tracks" name="njc_tracks" rows="6" class="large-text code" spellcheck="false"><?php echo esc_textarea( get_option( 'njc_tracks', njc_default_tracks() ) ); ?></textarea>
						<p class="description">One song per line, in this format: <code>words to match | label shown to visitors | audio file URL</code></p>
						<p class="description">The words are matched against the mantra name the visitor picks, so <code>ram, raam, राम</code> also covers "Jai Shri Ram". A song plays only while the visitor is tapping and fades out after they stop. Mantras with no matching line get a soft bead click instead.</p>
						<p class="description"><strong>Only add audio you own or have a licence to use.</strong> Hosting someone else's recording can bring takedown notices and can put ad approval at risk. Keep each file small (an MP3 of 2 to 4 MB loops well). If the audio sits on another domain such as a CDN, turn on CORS headers for that domain so fades work on iPhones.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="njc_idle">Stop the song after</label></th>
					<td>
						<input type="number" id="njc_idle" name="njc_idle" min="1" max="30" value="<?php echo esc_attr( njc_idle_seconds() ); ?>" class="small-text"> seconds without a tap
						<p class="description">The counter stretches this automatically for people who chant slowly, so the song does not stutter.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Home-screen install</th>
					<td>
						<input type="hidden" name="njc_pwa" value="0">
						<label><input type="checkbox" name="njc_pwa" value="1" <?php checked( 1, absint( get_option( 'njc_pwa', 1 ) ) ); ?>> Let visitors install the counter on their phone and use it offline</label>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
