/**
 * Browser Diagnostic Script for POS Role System
 *
 * Usage in browser console:
 * 1. Copy-paste this entire script
 * 2. Or load: <script src="browser-diagnostic.js"></script>
 * 3. Call: runDiagnostic()
 */

console.clear();
console.log('═══════════════════════════════════════════════════════════════');
console.log('  🔍 BROWSER DIAGNOSTIC - POS ROLE SYSTEM');
console.log('═══════════════════════════════════════════════════════════════\n');

function runDiagnostic() {
  const report = {
    timestamp: new Date().toISOString(),
    tests: [],
    warnings: [],
    errors: []
  };

  // Test 1: Global Functions
  console.log('📋 TEST 1: Global Functions');
  console.log('─'.repeat(60));
  const requiredFunctions = [
    'mostrarSelectorRol',
    'aplicarPermisosPorRol',
    'reinicializarNotificaciones',
    'manejarEventoPedido',
    'seleccionarRol',
    'logout',
    'mostrarNotificacionToast'
  ];

  let functionsFound = 0;
  requiredFunctions.forEach(func => {
    const exists = typeof window[func] === 'function';
    const icon = exists ? '✅' : '❌';
    console.log(`${icon} ${func}: ${typeof window[func]}`);
    if (exists) functionsFound++;
    report.tests.push({
      name: `Function: ${func}`,
      status: exists ? 'PASS' : 'FAIL',
      value: typeof window[func]
    });
  });
  console.log(`\nResult: ${functionsFound}/${requiredFunctions.length} functions found\n`);

  // Test 2: Global Objects
  console.log('📋 TEST 2: Global Objects & State');
  console.log('─'.repeat(60));

  const hasRolSystem = typeof window.rolSystem === 'object';
  console.log(`${hasRolSystem ? '✅' : '❌'} window.rolSystem: ${typeof window.rolSystem}`);

  if (hasRolSystem) {
    console.log(`  - currentRole: ${window.rolSystem.currentRole}`);
    console.log(`  - isManager: ${window.rolSystem.isManager}`);
    console.log(`  - notificacionesActivas: ${typeof window.rolSystem.notificacionesActivas}`);
    report.tests.push({ name: 'Global: rolSystem', status: 'PASS' });
  } else {
    report.errors.push('window.rolSystem not found');
  }

  console.log();

  // Test 3: DOM Elements
  console.log('📋 TEST 3: Required DOM Elements');
  console.log('─'.repeat(60));

  const requiredElements = [
    'role-selector',
    'panel-mesero',
    'panel-cajero',
    'panel-cocina',
    'panel-manager',
    'current-role',
    'btn-cambiar-rol',
    'toast-notification'
  ];

  let elementsFound = 0;
  requiredElements.forEach(id => {
    const el = document.getElementById(id);
    const exists = el !== null;
    const icon = exists ? '✅' : '❌';
    console.log(`${icon} #${id}: ${exists ? el.tagName : 'NOT FOUND'}`);
    if (exists) elementsFound++;
    report.tests.push({
      name: `Element: #${id}`,
      status: exists ? 'PASS' : 'FAIL'
    });
  });
  console.log(`\nResult: ${elementsFound}/${requiredElements.length} elements found\n`);

  // Test 4: LocalStorage
  console.log('📋 TEST 4: LocalStorage & Session Data');
  console.log('─'.repeat(60));

  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const token = localStorage.getItem('auth_token');
    const csrfToken = sessionStorage.getItem('csrf_token');

    console.log(`✅ localStorage.user: ${JSON.stringify(user)}`);
    console.log(`${token ? '✅' : '❌'} localStorage.auth_token: ${token ? '(present)' : '(missing)'}`);
    console.log(`${csrfToken ? '✅' : '❌'} sessionStorage.csrf_token: ${csrfToken ? '(present)' : '(missing)'}`);

    report.tests.push({
      name: 'Storage: user',
      status: 'PASS',
      value: user
    });
    report.tests.push({
      name: 'Storage: auth_token',
      status: token ? 'PASS' : 'WARN',
      value: !!token
    });
  } catch (e) {
    report.errors.push('LocalStorage error: ' + e.message);
    console.log(`❌ LocalStorage Error: ${e.message}`);
  }
  console.log();

  // Test 5: WebSocket
  console.log('📋 TEST 5: WebSocket Connection');
  console.log('─'.repeat(60));

  const hasNotifClient = window.notificacionesCliente !== undefined;
  console.log(`${hasNotifClient ? '✅' : '❌'} window.notificacionesCliente: ${typeof window.notificacionesCliente}`);

  if (hasNotifClient) {
    console.log(`  - Role: ${window.notificacionesCliente.rol}`);
    console.log(`  - WebSocket Active: ${window.notificacionesCliente.websocketActivo}`);
    console.log(`  - Polling Active: ${window.notificacionesCliente.pollingActivo}`);
    report.tests.push({
      name: 'WebSocket: Client',
      status: 'PASS',
      value: {
        role: window.notificacionesCliente.rol,
        wsActive: window.notificacionesCliente.websocketActivo,
        pollingActive: window.notificacionesCliente.pollingActivo
      }
    });
  } else {
    report.warnings.push('WebSocket client not initialized (expected before role change)');
    console.log(`⚠️  WebSocket not initialized (expected before role change)`);
  }
  console.log();

  // Test 6: Panel Visibility
  console.log('📋 TEST 6: Panel Visibility');
  console.log('─'.repeat(60));

  const panels = ['panel-mesero', 'panel-cajero', 'panel-cocina', 'panel-manager'];
  let visiblePanels = 0;

  panels.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const isVisible = el.style.display !== 'none' && window.getComputedStyle(el).display !== 'none';
      const icon = isVisible ? '👁️ ' : '❌';
      console.log(`${icon} #${id}: ${isVisible ? 'VISIBLE' : 'hidden'}`);
      if (isVisible) visiblePanels++;
    } else {
      console.log(`❌ #${id}: NOT FOUND`);
    }
  });

  console.log(`\nVisible Panels: ${visiblePanels}/4 (Should be 1)\n`);

  if (visiblePanels !== 1) {
    report.warnings.push(`Expected 1 visible panel, found ${visiblePanels}`);
  }

  // Test 7: Event Listeners
  console.log('📋 TEST 7: Event Listeners');
  console.log('─'.repeat(60));

  const btnCambiarRol = document.getElementById('btn-cambiar-rol');
  if (btnCambiarRol) {
    const onclick = btnCambiarRol.getAttribute('onclick');
    console.log(`✅ #btn-cambiar-rol onclick: "${onclick}"`);
    if (onclick === 'mostrarSelectorRol()') {
      console.log('   ✅ Correct handler');
      report.tests.push({ name: 'Handler: Cambiar Rol', status: 'PASS' });
    } else {
      console.log(`   ❌ Wrong handler: ${onclick}`);
      report.errors.push('btn-cambiar-rol has wrong onclick handler');
    }
  } else {
    report.errors.push('btn-cambiar-rol not found');
  }
  console.log();

  // Test 8: API Integration
  console.log('📋 TEST 8: API Integration');
  console.log('─'.repeat(60));

  const hasApiFetch = typeof window.apiFetch === 'function';
  console.log(`${hasApiFetch ? '✅' : '❌'} window.apiFetch: ${typeof window.apiFetch}`);

  if (hasApiFetch) {
    console.log('   ✅ API client available');
    report.tests.push({ name: 'API: apiFetch', status: 'PASS' });
  } else {
    report.warnings.push('apiFetch not available - check utils.js loaded');
  }
  console.log();

  // Test 9: Bootstrap
  console.log('📋 TEST 9: Bootstrap Integration');
  console.log('─'.repeat(60));

  const hasBootstrap = typeof bootstrap !== 'undefined';
  console.log(`${hasBootstrap ? '✅' : '❌'} Bootstrap: ${typeof bootstrap}`);

  if (hasBootstrap) {
    console.log(`   ✅ Bootstrap version available`);
    report.tests.push({ name: 'Bootstrap: Toast', status: 'PASS' });
  } else {
    report.errors.push('Bootstrap not loaded - Toast notifications will not work');
  }
  console.log();

  // Test 10: Browser Console Errors
  console.log('📋 TEST 10: Console State');
  console.log('─'.repeat(60));
  console.log('⚠️  Check browser console for any JavaScript errors');
  console.log('   (If you see red errors above, those need to be fixed)\n');

  // Summary
  console.log('═'.repeat(60));
  console.log('  📊 DIAGNOSTIC SUMMARY');
  console.log('═'.repeat(60));

  const passCount = report.tests.filter(t => t.status === 'PASS').length;
  const failCount = report.tests.filter(t => t.status === 'FAIL').length;
  const warnCount = report.warnings.length;
  const errorCount = report.errors.length;

  console.log(`\n✅ Passed Tests:    ${passCount}`);
  console.log(`❌ Failed Tests:    ${failCount}`);
  console.log(`⚠️  Warnings:        ${warnCount}`);
  console.log(`🔴 Errors:          ${errorCount}`);

  if (errorCount === 0 && failCount === 0) {
    console.log('\n🎉 ALL CHECKS PASSED! 🎉');
    console.log('\n✨ Ready for manual functional testing');
  } else {
    console.log('\n⚠️  ISSUES FOUND - Review above');
    if (report.errors.length > 0) {
      console.log('\nErrors:');
      report.errors.forEach(e => console.log(`  - ${e}`));
    }
    if (report.warnings.length > 0) {
      console.log('\nWarnings:');
      report.warnings.forEach(w => console.log(`  - ${w}`));
    }
  }

  console.log('\n═'.repeat(60) + '\n');

  return report;
}

// Quick test functions for manual testing
window.testRoleSwitch = function(role) {
  console.log(`\n🔄 Testing role switch to: ${role}`);
  try {
    seleccionarRol(role);
    console.log(`✅ Role switched to: ${role}`);
    console.log(`   Current state: ${JSON.stringify(window.rolSystem)}`);
  } catch (e) {
    console.error(`❌ Error switching role: ${e.message}`);
  }
};

window.testNotification = function(title = 'Test', message = 'This is a test notification') {
  console.log(`\n📬 Testing notification...`);
  try {
    mostrarNotificacionToast(title, message, 'info');
    console.log('✅ Notification should appear in bottom-right');
  } catch (e) {
    console.error(`❌ Error showing notification: ${e.message}`);
  }
};

window.testAPI = function() {
  console.log(`\n🔌 Testing API connection...`);
  try {
    apiFetch('/api/pos/categorias')
      .then(r => r.json())
      .then(data => {
        console.log(`✅ API working - got ${data.length} categories`);
      })
      .catch(e => {
        console.error(`❌ API error: ${e.message}`);
      });
  } catch (e) {
    console.error(`❌ Error testing API: ${e.message}`);
  }
};

// Export for testing
window.runDiagnostic = runDiagnostic;

// Auto-run if not in strict mode
console.log('💡 Available Commands:');
console.log('  - runDiagnostic()       : Run full diagnostic');
console.log('  - testRoleSwitch(role)  : Test role switching (mesero, cajero, cocinero, manager)');
console.log('  - testNotification()    : Test notification toast');
console.log('  - testAPI()             : Test API connection\n');

console.log('📍 Press Enter or type runDiagnostic() to start...\n');
