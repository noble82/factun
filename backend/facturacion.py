"""
Módulo de Facturación Electrónica para POS
Genera DTEs (Documentos Tributarios Electrónicos) para El Salvador
"""

import json
import uuid
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import os

class GeneradorDTE:
    """Genera documentos tributarios electrónicos en formato JSON para Digifact"""

    # Datos del emisor (se cargan desde variables de entorno o configuración)
    EMISOR = {
        "nit": os.getenv("EMISOR_NIT", "06142308221025"),
        "nrc": os.getenv("EMISOR_NRC", "1234567"),
        "nombre": os.getenv("EMISOR_NOMBRE", "PUPUSERÍA EL BUEN SABOR"),
        "codActividad": os.getenv("EMISOR_COD_ACTIVIDAD", "56101"),
        "descActividad": os.getenv("EMISOR_DESC_ACTIVIDAD", "Restaurantes"),
        "nombreComercial": os.getenv("EMISOR_NOMBRE_COMERCIAL", "Pupusería El Buen Sabor"),
        "tipoEstablecimiento": "01",
        "direccion": {
            "departamento": os.getenv("EMISOR_DEPTO", "06"),
            "municipio": os.getenv("EMISOR_MUNICIPIO", "14"),
            "complemento": os.getenv("EMISOR_DIRECCION", "Calle Principal #123, San Salvador")
        },
        "telefono": os.getenv("EMISOR_TELEFONO", "22001234"),
        "correo": os.getenv("EMISOR_CORREO", "facturacion@pupuseria.com"),
        "codEstableMH": os.getenv("EMISOR_COD_ESTABLE", "M001"),
        "codEstable": os.getenv("EMISOR_COD_ESTABLE", "M001"),
        "codPuntoVentaMH": os.getenv("EMISOR_COD_PV", "P001"),
        "codPuntoVenta": os.getenv("EMISOR_COD_PV", "P001")
    }

    # Tipos de documento
    TIPOS_DTE = {
        "01": "Factura",
        "03": "Comprobante de Crédito Fiscal",
        "05": "Nota de Crédito",
        "06": "Nota de Débito",
        "11": "Factura de Exportación",
        "14": "Factura de Sujeto Excluido"
    }

    @staticmethod
    def generar_codigo_generacion():
        """Genera un código de generación único (UUID)"""
        return str(uuid.uuid4()).upper()

    @staticmethod
    def generar_numero_control(tipo_dte, codigo_estable, punto_venta, correlativo):
        """
        Genera número de control según formato MH:
        DTE-TIPO-ESTABLE-PUNTOVENTA-CORRELATIVO
        """
        return f"DTE-{tipo_dte}-{codigo_estable}-{punto_venta}-{str(correlativo).zfill(15)}"

    @staticmethod
    def redondear(valor, decimales=2):
        """Redondea un valor a los decimales especificados"""
        return float(Decimal(str(valor)).quantize(Decimal(f'0.{"0" * decimales}'), rounding=ROUND_HALF_UP))

    @classmethod
    def generar_factura_consumidor(cls, pedido, cliente_info, correlativo):
        """
        Genera una Factura (tipo 01) para consumidor final

        Args:
            pedido: dict con información del pedido (items, totales, etc.)
            cliente_info: dict con información del cliente (opcional para CF)
            correlativo: número correlativo de la factura

        Returns:
            dict: Documento DTE en formato JSON
        """
        codigo_generacion = cls.generar_codigo_generacion()
        numero_control = cls.generar_numero_control(
            "01",
            cls.EMISOR["codEstableMH"],
            cls.EMISOR["codPuntoVentaMH"],
            correlativo
        )

        fecha_emision = datetime.now()

        # Identificación del documento
        identificacion = {
            "version": 1,
            "ambiente": os.getenv("DTE_AMBIENTE", "00"),  # 00=Pruebas, 01=Producción
            "tipoDte": "01",
            "numeroControl": numero_control,
            "codigoGeneracion": codigo_generacion,
            "tipoModelo": 1,  # 1=Normal
            "tipoOperacion": 1,  # 1=Transmisión normal
            "tipoContingencia": None,
            "motivoContin": None,
            "fecEmi": fecha_emision.strftime("%Y-%m-%d"),
            "horEmi": fecha_emision.strftime("%H:%M:%S"),
            "tipoMoneda": "USD"
        }

        # Documentos relacionados (vacío para factura simple)
        documentos_relacionados = None

        # Emisor
        emisor = cls.EMISOR.copy()

        # Receptor (consumidor final o con datos)
        if cliente_info and cliente_info.get("nit"):
            receptor = {
                "tipoDocumento": cliente_info.get("tipoDocumento", "36"),  # 36=NIT, 13=DUI
                "numDocumento": cliente_info.get("nit", ""),
                "nrc": cliente_info.get("nrc"),
                "nombre": cliente_info.get("nombre", "Consumidor Final"),
                "codActividad": cliente_info.get("codActividad"),
                "descActividad": cliente_info.get("descActividad"),
                "direccion": {
                    "departamento": cliente_info.get("departamento", "06"),
                    "municipio": cliente_info.get("municipio", "14"),
                    "complemento": cliente_info.get("direccion", "San Salvador")
                },
                "telefono": cliente_info.get("telefono"),
                "correo": cliente_info.get("correo")
            }
        else:
            # Consumidor final
            receptor = {
                "tipoDocumento": None,
                "numDocumento": None,
                "nrc": None,
                "nombre": cliente_info.get("nombre") if cliente_info else "Consumidor Final",
                "codActividad": None,
                "descActividad": None,
                "direccion": None,
                "telefono": cliente_info.get("telefono") if cliente_info else None,
                "correo": cliente_info.get("correo") if cliente_info else None
            }

        # Cuerpo del documento (items)
        cuerpo_documento = []
        for i, item in enumerate(pedido["items"], 1):
            precio_uni = cls.redondear(item["precio_unitario"])
            cantidad = item["cantidad"]

            # Calcular montos
            venta_gravada = cls.redondear(precio_uni * cantidad)

            item_dte = {
                "numItem": i,
                "tipoItem": 1,  # 1=Bienes, 2=Servicios
                "numeroDocumento": None,
                "cantidad": cantidad,
                "codigo": str(item.get("producto_id", i)),
                "codTributo": None,
                "uniMedida": 59,  # 59=Unidad
                "descripcion": item.get("producto_nombre", item.get("nombre", "Producto")),
                "precioUni": precio_uni,
                "montoDescu": 0,
                "ventaNoSuj": 0,
                "ventaExenta": 0,
                "ventaGravada": venta_gravada,
                "tributos": None,
                "psv": 0,
                "noGravado": 0,
                "ivaItem": cls.redondear(venta_gravada * 0.13)
            }
            cuerpo_documento.append(item_dte)

        # Resumen
        total_gravada = cls.redondear(sum(item["ventaGravada"] for item in cuerpo_documento))
        total_iva = cls.redondear(total_gravada * 0.13)
        total_pagar = cls.redondear(total_gravada + total_iva)

        resumen = {
            "totalNoSuj": 0,
            "totalExenta": 0,
            "totalGravada": total_gravada,
            "subTotalVentas": total_gravada,
            "descuNoSuj": 0,
            "descuExenta": 0,
            "descuGravada": 0,
            "porcentajeDescuento": 0,
            "totalDescu": 0,
            "tributos": None,
            "subTotal": total_gravada,
            "ivaRete1": 0,
            "reteRenta": 0,
            "montoTotalOperacion": total_pagar,
            "totalNoGravado": 0,
            "totalPagar": total_pagar,
            "totalLetras": cls.numero_a_letras(total_pagar),
            "totalIva": total_iva,
            "saldoFavor": 0,
            "condicionOperacion": 1,  # 1=Contado
            "pagos": [{
                "codigo": "01",  # 01=Billetes y monedas
                "montoPago": total_pagar,
                "referencia": None,
                "plazo": None,
                "periodo": None
            }],
            "numPagoElectronico": None
        }

        # Extensión (opcional)
        extension = {
            "nombEntrega": None,
            "docuEntrega": None,
            "nombRecibe": None,
            "docuRecibe": None,
            "observaciones": pedido.get("notas", None),
            "placaVehiculo": None
        }

        # Apéndice (información adicional)
        apendice = [{
            "campo": "Pedido",
            "etiqueta": "No. Pedido",
            "valor": str(pedido.get("id", ""))
        }]

        # Documento completo
        dte = {
            "identificacion": identificacion,
            "documentoRelacionado": documentos_relacionados,
            "emisor": emisor,
            "receptor": receptor,
            "otrosDocumentos": None,
            "ventaTercero": None,
            "cuerpoDocumento": cuerpo_documento,
            "resumen": resumen,
            "extension": extension,
            "apendice": apendice
        }

        return {
            "dte": dte,
            "codigo_generacion": codigo_generacion,
            "numero_control": numero_control,
            "total": total_pagar
        }

    @classmethod
    def generar_ticket(cls, pedido, numero_ticket):
        """
        Genera un ticket/comprobante simple (no fiscal)
        Para uso cuando no se requiere factura electrónica
        """
        fecha = datetime.now()

        ticket = {
            "tipo": "TICKET",
            "numero": f"T-{str(numero_ticket).zfill(8)}",
            "fecha": fecha.strftime("%Y-%m-%d"),
            "hora": fecha.strftime("%H:%M:%S"),
            "empresa": {
                "nombre": cls.EMISOR["nombreComercial"],
                "direccion": cls.EMISOR["direccion"]["complemento"],
                "telefono": cls.EMISOR["telefono"],
                "nit": cls.EMISOR["nit"]
            },
            "mesa": pedido.get("mesa_numero", "N/A"),
            "mesero": pedido.get("mesero", ""),
            "items": [],
            "subtotal": cls.redondear(pedido["subtotal"]),
            "iva": cls.redondear(pedido["impuesto"]),
            "total": cls.redondear(pedido["total"]),
            "pedido_id": pedido.get("id")
        }

        for item in pedido["items"]:
            ticket["items"].append({
                "cantidad": item["cantidad"],
                "descripcion": item.get("producto_nombre", item.get("nombre", "")),
                "precio_unitario": cls.redondear(item["precio_unitario"]),
                "subtotal": cls.redondear(item["subtotal"])
            })

        return ticket

    @staticmethod
    def numero_a_letras(numero):
        """Convierte un número a su representación en letras"""
        unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
        decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
        especiales = {
            11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
            16: 'DIECISÉIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
            21: 'VEINTIUNO', 22: 'VEINTIDÓS', 23: 'VEINTITRÉS', 24: 'VEINTICUATRO',
            25: 'VEINTICINCO', 26: 'VEINTISÉIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE'
        }
        centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS',
                    'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

        def convertir_grupo(n):
            if n == 0:
                return ''
            if n == 100:
                return 'CIEN'
            if n in especiales:
                return especiales[n]

            resultado = ''
            if n >= 100:
                resultado += centenas[n // 100] + ' '
                n %= 100

            if n in especiales:
                resultado += especiales[n]
            elif n >= 10:
                resultado += decenas[n // 10]
                if n % 10 != 0:
                    resultado += ' Y ' + unidades[n % 10]
            else:
                resultado += unidades[n]

            return resultado.strip()

        entero = int(numero)
        centavos = int(round((numero - entero) * 100))

        if entero == 0:
            letras = 'CERO'
        elif entero == 1:
            letras = 'UN'
        else:
            letras = convertir_grupo(entero)

        return f"{letras} {centavos:02d}/100 DÓLARES"


class ControlCorrelativo:
    """Controla los correlativos de facturas y tickets"""

    @staticmethod
    def obtener_siguiente_correlativo(conn, tipo):
        """
        Obtiene el siguiente correlativo para facturas o tickets

        Args:
            conn: conexión a la base de datos SQLite
            tipo: 'factura' o 'ticket'
        """
        cursor = conn.cursor()

        # Crear tabla de correlativos si no existe
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS correlativos (
                tipo TEXT PRIMARY KEY,
                ultimo INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Obtener o crear correlativo
        cursor.execute('SELECT ultimo FROM correlativos WHERE tipo = ?', (tipo,))
        row = cursor.fetchone()

        if row:
            siguiente = row[0] + 1
            cursor.execute(
                'UPDATE correlativos SET ultimo = ?, updated_at = CURRENT_TIMESTAMP WHERE tipo = ?',
                (siguiente, tipo)
            )
        else:
            siguiente = 1
            cursor.execute(
                'INSERT INTO correlativos (tipo, ultimo) VALUES (?, ?)',
                (tipo, siguiente)
            )

        conn.commit()
        return siguiente
