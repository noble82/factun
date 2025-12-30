const API_BASE = '';  // Usa rutas relativas - nginx hace proxy a /api
let loadingModal;

document.addEventListener('DOMContentLoaded', () => {
    loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    testConnection();
});

async function testConnection() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (response.ok) {
            updateStatus('Conectado', 'success');
        } else {
            updateStatus('Error de conexión', 'danger');
        }
    } catch (error) {
        updateStatus('Desconectado', 'secondary');
    }
}

function updateStatus(text, type) {
    const badge = document.getElementById('status-badge');
    badge.textContent = text;
    badge.className = `badge bg-${type}`;
}

function showLoading() {
    loadingModal.show();
}

function hideLoading() {
    loadingModal.hide();
}

async function certificarDTE() {
    const fileInput = document.getElementById('xmlFile');

    if (!fileInput.files.length) {
        showAlert('Por favor selecciona un archivo XML', 'warning', 'resultCertificar');
        return;
    }

    const formData = new FormData();
    formData.append('xml', fileInput.files[0]);

    try {
        showLoading();
        const response = await fetch(`${API_BASE}/api/certificar`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        hideLoading();

        if (result.success) {
            showResult(result.data, 'resultCertificar', 'success');

            // Botón de descarga PDF si existe
            if (result.data.pdfBase64) {
                addDownloadButton(result.data.pdfBase64, 'resultCertificar');
            }
        } else {
            showAlert(result.error, 'danger', 'resultCertificar');
        }
    } catch (error) {
        hideLoading();
        showAlert(`Error: ${error.message}`, 'danger', 'resultCertificar');
    }
}

async function anularDTE() {
    const guid = document.getElementById('anularGuid').value;
    const serie = document.getElementById('anularSerie').value;
    const numero = document.getElementById('anularNumero').value;
    const motivo = document.getElementById('anularMotivo').value;

    if (!guid || !serie || !numero) {
        showAlert('Por favor completa todos los campos requeridos', 'warning', 'resultAnular');
        return;
    }

    try {
        showLoading();
        const response = await fetch(`${API_BASE}/api/anular`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ guid, serie, numero, motivo })
        });

        const result = await response.json();
        hideLoading();

        if (result.success) {
            showResult(result.data, 'resultAnular', 'success');
        } else {
            showAlert(result.error, 'danger', 'resultAnular');
        }
    } catch (error) {
        hideLoading();
        showAlert(`Error: ${error.message}`, 'danger', 'resultAnular');
    }
}

async function consultarDTE() {
    const nit = document.getElementById('consultarNit').value;
    const guid = document.getElementById('consultarGuid').value;

    if (!nit || !guid) {
        showAlert('Por favor completa NIT y GUID', 'warning', 'resultConsultar');
        return;
    }

    try {
        showLoading();
        const response = await fetch(`${API_BASE}/api/consultar?nit=${encodeURIComponent(nit)}&guid=${encodeURIComponent(guid)}`);

        const result = await response.json();
        hideLoading();

        if (result.success) {
            showResult(result.data, 'resultConsultar', 'info');
        } else {
            showAlert(result.error, 'danger', 'resultConsultar');
        }
    } catch (error) {
        hideLoading();
        showAlert(`Error: ${error.message}`, 'danger', 'resultConsultar');
    }
}

function showResult(data, targetId, type) {
    const resultDiv = document.getElementById(targetId);
    resultDiv.innerHTML = `
        <div class="card result-card ${type}">
            <div class="card-header bg-${type} text-white">
                <i class="bi bi-check-circle-fill"></i> Resultado
            </div>
            <div class="card-body">
                <div class="json-viewer">
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                </div>
            </div>
        </div>
    `;
}

// Nota: window.escapeHtml() está centralizada en utils.js

function showAlert(message, type, targetId) {
    const resultDiv = document.getElementById(targetId);
    const safeMessage = window.escapeHtml(message);
    resultDiv.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            <i class="bi bi-exclamation-triangle-fill"></i> ${safeMessage}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
}

function addDownloadButton(pdfBase64, targetId) {
    const resultDiv = document.getElementById(targetId);
    const button = document.createElement('button');
    button.className = 'btn btn-primary btn-download';
    button.innerHTML = '<i class="bi bi-download"></i> Descargar PDF';
    button.onclick = () => downloadPDF(pdfBase64);
    resultDiv.querySelector('.card-body').appendChild(button);
}

async function downloadPDF(pdfBase64) {
    try {
        const response = await fetch(`${API_BASE}/api/download/pdf`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ pdfBase64 })
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `factura_${new Date().getTime()}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        alert(`Error descargando PDF: ${error.message}`);
    }
}

function limpiarResultado(targetId) {
    document.getElementById(targetId).innerHTML = '';
}
