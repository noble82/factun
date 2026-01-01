"""
Módulo de Facturación Electrónica para POS
Genera DTEs (Documentos Tributarios Electrónicos) para El Salvador en formato Digifact
Soporta tanto JSON como XML según especificación oficial de Digifact
"""

import json
import uuid
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import os

class GeneradorDTE:
    """Genera documentos tributarios electrónicos en formato JSON y XML para Digifact"""

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
        Genera número de control según formato Digifact:
        TIPO+ESTABLE+PUNTOVENTA+SECUENCIAL (15 dígitos)
        Ejemplo: 000900021000002
        """
        # Usar formato de 15 dígitos: 003 + 01223344 (8) + 000002 (6)
        tipo_str = str(tipo_dte).zfill(2)
        estable_str = str(codigo_estable).zfill(4) if codigo_estable else "0001"
        punto_str = str(punto_venta).zfill(4) if punto_venta else "0001"
        correlativo_str = str(correlativo).zfill(5)

        return tipo_str + estable_str + punto_str + correlativo_str  # 15 dígitos

    @staticmethod
    def redondear(valor, decimales=2):
        """Redondea un valor a los decimales especificados"""
        return float(Decimal(str(valor)).quantize(Decimal(f'0.{"0" * decimales}'), rounding=ROUND_HALF_UP))

    @classmethod
    def generar_factura_consumidor(cls, pedido, cliente_info, correlativo):
        """
        Genera una Factura (tipo 01) para consumidor final en formato Digifact oficial

        Integra IVA desglosado por item (FASE 3) en la estructura Digifact

        Args:
            pedido: dict con información del pedido incluyendo items con iva_monto y total_item
            cliente_info: dict con información del cliente (opcional para consumidor final)
            correlativo: número correlativo de la factura

        Returns:
            dict: {
                "json": Documento DTE en formato JSON Digifact,
                "xml": Documento DTE en formato XML Digifact,
                "codigo_generacion": UUID del documento,
                "numero_control": Número de control Digifact,
                "total": Total a pagar
            }
        """
        codigo_generacion = cls.generar_codigo_generacion()
        numero_control = cls.generar_numero_control(
            "01",
            cls.EMISOR["codEstable"],
            cls.EMISOR["codPuntoVenta"],
            correlativo
        )

        fecha_emision = datetime.now()
        fecha_iso = fecha_emision.isoformat() + "-06:00"  # Zona horaria El Salvador

        # ===== ESTRUCTURA DIGIFACT OFICIAL =====
        # Basada en NUC 1-FAC.json de ejemplos Digifact

        # Header/Encabezado
        header = {
            "DocType": "01",  # Factura
            "IssuedDateTime": fecha_iso,
            "AdditionalIssueType": os.getenv("DTE_AMBIENTE", "00"),  # 00=Prueba, 01=Producción
            "Currency": "USD",
            "AdditionalIssueDocInfo": [
                {
                    "Name": "Secuencial",
                    "Data": None,
                    "Value": numero_control  # 15 dígitos
                },
                {
                    "Name": "CodEstPuntoV",
                    "Data": None,
                    "Value": cls.EMISOR["codEstableMH"] + cls.EMISOR["codPuntoVentaMH"]
                },
                {
                    "Name": "TipoModelo",
                    "Data": None,
                    "Value": "1"  # 1=Normal
                },
                {
                    "Name": "TipoOperacion",
                    "Data": None,
                    "Value": "1"  # 1=Transmisión normal
                }
            ]
        }

        # Seller/Emisor
        seller = {
            "TaxID": cls.EMISOR["nit"],
            "TaxIDAdditionalInfo": [
                {
                    "Name": "NRC",
                    "Data": None,
                    "Value": cls.EMISOR["nrc"]
                },
                {
                    "Name": "CodigoActividad",
                    "Data": None,
                    "Value": cls.EMISOR["codActividad"]
                },
                {
                    "Name": "DescActividad",
                    "Data": None,
                    "Value": cls.EMISOR["descActividad"]
                }
            ],
            "Name": cls.EMISOR["nombre"],
            "Contact": {
                "PhoneList": {
                    "Phone": [cls.EMISOR["telefono"]]
                },
                "EmailList": {
                    "Email": [cls.EMISOR["correo"]]
                }
            },
            "AdditionlInfo": [
                {
                    "Name": "NombreComercial",
                    "Data": None,
                    "Value": cls.EMISOR["nombreComercial"]
                },
                {
                    "Name": "TipoEstablecimiento",
                    "Data": None,
                    "Value": cls.EMISOR["tipoEstablecimiento"]
                },
                {
                    "Name": "CodEstablecimientoMH",
                    "Data": None,
                    "Value": cls.EMISOR["codEstableMH"]
                },
                {
                    "Name": "CodEstablecimiento",
                    "Data": None,
                    "Value": cls.EMISOR["codEstable"]
                },
                {
                    "Name": "CodPuntoVentaMH",
                    "Data": None,
                    "Value": cls.EMISOR["codPuntoVentaMH"]
                },
                {
                    "Name": "CodPuntoVenta",
                    "Data": None,
                    "Value": cls.EMISOR["codPuntoVenta"]
                }
            ],
            "AddressInfo": {
                "Address": cls.EMISOR["direccion"]["complemento"],
                "District": cls.EMISOR["direccion"]["municipio"],
                "State": cls.EMISOR["direccion"]["departamento"],
                "Country": "SV"
            }
        }

        # Buyer/Receptor
        if cliente_info and cliente_info.get("nit"):
            buyer = {
                "TaxID": cliente_info.get("nit", ""),
                "TaxIDType": cliente_info.get("tipoDocumento", "03"),  # 03=NIT, 13=DUI
                "TaxIDAdditionalInfo": [
                    {
                        "Name": "CodigoActividad",
                        "Data": None,
                        "Value": cliente_info.get("codActividad", "")
                    },
                    {
                        "Name": "DescActividad",
                        "Data": None,
                        "Value": cliente_info.get("descActividad", "")
                    }
                ] if cliente_info.get("codActividad") else None,
                "Name": cliente_info.get("nombre", "Consumidor Final"),
                "Contact": {
                    "PhoneList": {
                        "Phone": [cliente_info.get("telefono", "")]
                    } if cliente_info.get("telefono") else {"Phone": []},
                    "EmailList": {
                        "Email": [cliente_info.get("correo", "")]
                    } if cliente_info.get("correo") else {"Email": []}
                },
                "AdditionlInfo": None,
                "AddressInfo": {
                    "Address": cliente_info.get("direccion", "San Salvador"),
                    "District": cliente_info.get("municipio", "14"),
                    "State": cliente_info.get("departamento", "06"),
                    "Country": "SV"
                }
            }
        else:
            # Consumidor final
            buyer = {
                "TaxID": None,
                "TaxIDType": None,
                "TaxIDAdditionalInfo": None,
                "Name": "Consumidor Final",
                "Contact": {
                    "PhoneList": {"Phone": []},
                    "EmailList": {"Email": []}
                },
                "AdditionlInfo": None,
                "AddressInfo": {
                    "Address": "San Salvador",
                    "District": "14",
                    "State": "06",
                    "Country": "SV"
                }
            }

        # Items/Cuerpo del documento
        # IMPORTANTE: Solo incluir items principales (no desgloces de combo)
        # Los desgloces son para cocina, no para factura
        items = []
        num_item = 1

        for item_db in pedido.get("items", []):
            # Saltar desgloces de combo (tienen notas='Desglose de combo')
            if item_db.get("notas") == "Desglose de combo":
                continue

            precio_uni = cls.redondear(item_db.get("precio_unitario", 0))
            cantidad = item_db.get("cantidad", 1)
            subtotal = cls.redondear(item_db.get("subtotal", precio_uni * cantidad))

            # Usar IVA desglosado de la DB (FASE 3)
            iva_monto = cls.redondear(item_db.get("iva_monto", subtotal * 0.13))
            total_item = cls.redondear(item_db.get("total_item", subtotal + iva_monto))

            # Determinar tipo de venta (gravada, exenta, no sujeta)
            # Por defecto, toda venta en restaurante es gravada (13% IVA)
            venta_gravada = subtotal
            venta_exenta = 0
            venta_no_sujeta = 0

            item_dte = {
                "Number": str(num_item),
                "Codes": [
                    {
                        "Name": "Codigo",
                        "Data": None,
                        "Value": str(item_db.get("producto_id", num_item))
                    }
                ],
                "Type": "1",  # 1=Bienes, 2=Servicios
                "Description": item_db.get("producto_nombre", "Producto"),
                "Qty": float(cantidad),
                "UnitOfMeasure": "59",  # 59=UNIDAD
                "Price": precio_uni,
                "Discounts": {
                    "Discount": [
                        {
                            "Amount": 0.00
                        }
                    ]
                },
                "Taxes": None,
                "Charges": {
                    "Charge": [
                        {
                            "Code": "VENTA_GRAVADA",
                            "Amount": venta_gravada
                        }
                    ] if venta_gravada > 0 else []
                },
                "Totals": {
                    "TotalItem": total_item
                },
                "AdditionalInfo": [
                    {
                        "Name": "PrecioSugeridoVenta",
                        "Data": None,
                        "Value": "0.00"
                    },
                    {
                        "Name": "IvaItem",
                        "Data": None,
                        "Value": str(cls.redondear(iva_monto, 2))
                    }
                ]
            }
            items.append(item_dte)
            num_item += 1

        # Calcular totales
        total_gravada = cls.redondear(
            sum(cls.redondear(item.get("precio_unitario", 0) * item.get("cantidad", 1))
                for item in pedido.get("items", [])
                if item.get("notas") != "Desglose de combo")
        )
        total_exenta = 0
        total_no_sujeta = 0
        total_descuentos = 0

        # IVA total: suma de iva_monto de items principales
        total_iva = cls.redondear(
            sum(item.get("iva_monto", 0)
                for item in pedido.get("items", [])
                if item.get("notas") != "Desglose de combo")
        )

        total_pagar = cls.redondear(total_gravada + total_iva)

        # Totals/Resumen
        totals = {
            "TotalCharges": {
                "TotalCharge": [
                    {
                        "Code": "TOTAL_NO_SUJETA",
                        "Amount": 0.00
                    },
                    {
                        "Code": "TOTAL_EXENTA",
                        "Amount": 0.00
                    },
                    {
                        "Code": "TOTAL_GRAVADA",
                        "Amount": total_gravada
                    },
                    {
                        "Code": "TOTAL_NO_GRAVADO",
                        "Amount": 0.00
                    }
                ]
            },
            "TotalDiscounts": {
                "Discount": [
                    {
                        "Code": "NO_SUJETA",
                        "Amount": 0.00
                    },
                    {
                        "Code": "EXENTA",
                        "Amount": 0.00
                    },
                    {
                        "Code": "GRAVADA",
                        "Amount": 0.00
                    },
                    {
                        "Code": "PORCENTAJE_DESCUENTO",
                        "Amount": 0.00
                    }
                ]
            },
            "GrandTotal": {
                "InvoiceTotal": total_pagar
            },
            "InWords": cls.numero_a_letras(total_pagar),
            "AdditionalInfo": [
                {
                    "Name": "IvaRetenido",
                    "Data": None,
                    "Value": "0.00"
                },
                {
                    "Name": "RetencionRenta",
                    "Data": None,
                    "Value": "0.00"
                },
                {
                    "Name": "SaldoFavor",
                    "Data": None,
                    "Value": "0.00"
                },
                {
                    "Name": "CondicionOperacion",
                    "Data": None,
                    "Value": "1"  # 1=Contado
                },
                {
                    "Name": "NumPagoElectronico",
                    "Data": None,
                    "Value": None
                }
            ]
        }

        # Payments/Pagos
        payments = [
            {
                "Code": "01",  # Billetes y monedas/Efectivo
                "Amount": total_pagar
            }
        ]

        # Additional Document Info
        additional_doc_info = {
            "AdditionalInfo": [
                {
                    "AditionalData": {
                        "Data": [
                            {
                                "Info": [
                                    {
                                        "Name": "REFERENCIA_INTERNA",
                                        "Data": "Pedido",
                                        "Value": str(pedido.get("id", ""))
                                    }
                                ],
                                "Name": "APENDICE"
                            }
                        ]
                    },
                    "AditionalInfo": None
                }
            ]
        }

        # Documento completo en formato Digifact
        dte_json = {
            "Version": "1",
            "CountryCode": "SV",
            "Header": header,
            "Seller": seller,
            "Buyer": buyer,
            "Items": items,
            "Totals": totals,
            "Payments": payments,
            "AdditionalDocumentInfo": additional_doc_info
        }

        # Generar XML desde la estructura JSON
        dte_xml = cls._generar_xml_desde_json(dte_json)

        return {
            "json": dte_json,
            "xml": dte_xml,
            "codigo_generacion": codigo_generacion,
            "numero_control": numero_control,
            "secuencial": numero_control,
            "total": total_pagar,
            "subtotal": total_gravada,
            "iva": total_iva
        }

    @classmethod
    def _generar_xml_desde_json(cls, dte_json):
        """
        Convierte la estructura JSON de DTE a formato XML Digifact

        Args:
            dte_json: dict con la estructura del DTE en formato JSON

        Returns:
            str: XML formateado y con declaración XML
        """
        root = ET.Element("Root")

        # Version
        version_elem = ET.SubElement(root, "Version")
        version_elem.text = dte_json.get("Version", "1")

        # CountryCode
        country_elem = ET.SubElement(root, "CountryCode")
        country_elem.text = dte_json.get("CountryCode", "SV")

        # Header
        header_data = dte_json.get("Header", {})
        header_elem = ET.SubElement(root, "Header")

        ET.SubElement(header_elem, "DocType").text = header_data.get("DocType", "01")
        ET.SubElement(header_elem, "IssuedDateTime").text = header_data.get("IssuedDateTime", "")
        ET.SubElement(header_elem, "AdditionalIssueType").text = header_data.get("AdditionalIssueType", "00")
        ET.SubElement(header_elem, "Currency").text = header_data.get("Currency", "USD")

        additional_issue_elem = ET.SubElement(header_elem, "AdditionalIssueDocInfo")
        for info in header_data.get("AdditionalIssueDocInfo", []):
            info_elem = ET.SubElement(additional_issue_elem, "Info")
            info_elem.set("Name", info.get("Name", ""))
            if info.get("Data"):
                info_elem.set("Data", str(info.get("Data", "")))
            info_elem.set("Value", str(info.get("Value", "")))

        # Seller
        seller_data = dte_json.get("Seller", {})
        seller_elem = ET.SubElement(root, "Seller")

        ET.SubElement(seller_elem, "TaxID").text = seller_data.get("TaxID", "")

        tax_id_info = ET.SubElement(seller_elem, "TaxIDAdditionalInfo")
        for info in seller_data.get("TaxIDAdditionalInfo", []):
            info_elem = ET.SubElement(tax_id_info, "Info")
            info_elem.set("Name", info.get("Name", ""))
            if info.get("Data"):
                info_elem.set("Data", str(info.get("Data", "")))
            info_elem.set("Value", str(info.get("Value", "")))

        ET.SubElement(seller_elem, "Name").text = seller_data.get("Name", "")

        # Contact
        contact = seller_data.get("Contact", {})
        contact_elem = ET.SubElement(seller_elem, "Contact")
        phone_list = ET.SubElement(contact_elem, "PhoneList")
        for phone in contact.get("PhoneList", {}).get("Phone", []):
            phone_elem = ET.SubElement(phone_list, "Phone")
            phone_elem.text = str(phone)

        email_list = ET.SubElement(contact_elem, "EmailList")
        for email in contact.get("EmailList", {}).get("Email", []):
            email_elem = ET.SubElement(email_list, "Email")
            email_elem.text = str(email)

        # Seller Additional Info
        additional_info = ET.SubElement(seller_elem, "AdditionlInfo")
        for info in seller_data.get("AdditionlInfo", []):
            info_elem = ET.SubElement(additional_info, "Info")
            info_elem.set("Name", info.get("Name", ""))
            if info.get("Data"):
                info_elem.set("Data", str(info.get("Data", "")))
            info_elem.set("Value", str(info.get("Value", "")))

        # Seller Address
        address = seller_data.get("AddressInfo", {})
        address_elem = ET.SubElement(seller_elem, "AddressInfo")
        ET.SubElement(address_elem, "Address").text = address.get("Address", "")
        ET.SubElement(address_elem, "District").text = str(address.get("District", ""))
        ET.SubElement(address_elem, "State").text = str(address.get("State", ""))
        ET.SubElement(address_elem, "Country").text = address.get("Country", "SV")

        # Buyer
        buyer_data = dte_json.get("Buyer", {})
        buyer_elem = ET.SubElement(root, "Buyer")

        buyer_tax_id = buyer_data.get("TaxID")
        if buyer_tax_id:
            ET.SubElement(buyer_elem, "TaxID").text = str(buyer_tax_id)

        buyer_tax_type = buyer_data.get("TaxIDType")
        if buyer_tax_type:
            ET.SubElement(buyer_elem, "TaxIDType").text = str(buyer_tax_type)

        buyer_tax_info = buyer_data.get("TaxIDAdditionalInfo")
        if buyer_tax_info:
            tax_id_info_buyer = ET.SubElement(buyer_elem, "TaxIDAdditionalInfo")
            for info in buyer_tax_info:
                info_elem = ET.SubElement(tax_id_info_buyer, "Info")
                info_elem.set("Name", info.get("Name", ""))
                if info.get("Data"):
                    info_elem.set("Data", str(info.get("Data", "")))
                info_elem.set("Value", str(info.get("Value", "")))

        ET.SubElement(buyer_elem, "Name").text = buyer_data.get("Name", "")

        # Buyer Contact
        buyer_contact = buyer_data.get("Contact", {})
        buyer_contact_elem = ET.SubElement(buyer_elem, "Contact")
        buyer_phone_list = ET.SubElement(buyer_contact_elem, "PhoneList")
        for phone in buyer_contact.get("PhoneList", {}).get("Phone", []):
            phone_elem = ET.SubElement(buyer_phone_list, "Phone")
            phone_elem.text = str(phone)

        buyer_email_list = ET.SubElement(buyer_contact_elem, "EmailList")
        for email in buyer_contact.get("EmailList", {}).get("Email", []):
            email_elem = ET.SubElement(buyer_email_list, "Email")
            email_elem.text = str(email)

        # Buyer Address
        buyer_address = buyer_data.get("AddressInfo", {})
        buyer_address_elem = ET.SubElement(buyer_elem, "AddressInfo")
        ET.SubElement(buyer_address_elem, "Address").text = buyer_address.get("Address", "")
        ET.SubElement(buyer_address_elem, "District").text = str(buyer_address.get("District", ""))
        ET.SubElement(buyer_address_elem, "State").text = str(buyer_address.get("State", ""))
        ET.SubElement(buyer_address_elem, "Country").text = buyer_address.get("Country", "SV")

        # Items
        items_elem = ET.SubElement(root, "Items")
        for item in dte_json.get("Items", []):
            item_elem = ET.SubElement(items_elem, "Item")
            item_elem.set("Number", item.get("Number", ""))

            # Codes
            codes_elem = ET.SubElement(item_elem, "Codes")
            for code in item.get("Codes", []):
                code_elem = ET.SubElement(codes_elem, "Code")
                code_elem.set("Name", code.get("Name", ""))
                if code.get("Data"):
                    code_elem.set("Data", str(code.get("Data", "")))
                code_elem.set("Value", str(code.get("Value", "")))

            ET.SubElement(item_elem, "Type").text = str(item.get("Type", "1"))
            ET.SubElement(item_elem, "Description").text = item.get("Description", "")
            ET.SubElement(item_elem, "Qty").text = str(item.get("Qty", ""))
            ET.SubElement(item_elem, "UnitOfMeasure").text = str(item.get("UnitOfMeasure", "59"))
            ET.SubElement(item_elem, "Price").text = str(item.get("Price", ""))

            # Discounts
            discounts_elem = ET.SubElement(item_elem, "Discounts")
            for discount in item.get("Discounts", {}).get("Discount", []):
                discount_elem = ET.SubElement(discounts_elem, "Discount")
                ET.SubElement(discount_elem, "Amount").text = str(discount.get("Amount", "0.00"))

            # Charges
            charges_elem = ET.SubElement(item_elem, "Charges")
            for charge in item.get("Charges", {}).get("Charge", []):
                charge_elem = ET.SubElement(charges_elem, "Charge")
                ET.SubElement(charge_elem, "Code").text = charge.get("Code", "")
                ET.SubElement(charge_elem, "Amount").text = str(charge.get("Amount", "0.00"))

            # Totals
            totals_item = ET.SubElement(item_elem, "Totals")
            ET.SubElement(totals_item, "TotalItem").text = str(item.get("Totals", {}).get("TotalItem", "0.00"))

            # AdditionalInfo
            additional_info_item = ET.SubElement(item_elem, "AdditionalInfo")
            for info in item.get("AdditionalInfo", []):
                info_elem = ET.SubElement(additional_info_item, "Info")
                info_elem.set("Name", info.get("Name", ""))
                if info.get("Data"):
                    info_elem.set("Data", str(info.get("Data", "")))
                info_elem.set("Value", str(info.get("Value", "")))

        # Totals
        totals_data = dte_json.get("Totals", {})
        totals_elem = ET.SubElement(root, "Totals")

        # TotalCharges
        total_charges_elem = ET.SubElement(totals_elem, "TotalCharges")
        for charge in totals_data.get("TotalCharges", {}).get("TotalCharge", []):
            charge_elem = ET.SubElement(total_charges_elem, "TotalCharge")
            ET.SubElement(charge_elem, "Code").text = charge.get("Code", "")
            ET.SubElement(charge_elem, "Amount").text = str(charge.get("Amount", "0.00"))

        # TotalDiscounts
        total_discounts_elem = ET.SubElement(totals_elem, "TotalDiscounts")
        for discount in totals_data.get("TotalDiscounts", {}).get("Discount", []):
            discount_elem = ET.SubElement(total_discounts_elem, "Discount")
            ET.SubElement(discount_elem, "Code").text = discount.get("Code", "")
            ET.SubElement(discount_elem, "Amount").text = str(discount.get("Amount", "0.00"))

        # GrandTotal
        grand_total = ET.SubElement(totals_elem, "GrandTotal")
        ET.SubElement(grand_total, "InvoiceTotal").text = str(
            totals_data.get("GrandTotal", {}).get("InvoiceTotal", "0.00")
        )

        # InWords
        ET.SubElement(totals_elem, "InWords").text = totals_data.get("InWords", "")

        # AdditionalInfo in Totals
        additional_info_totals = ET.SubElement(totals_elem, "AdditionalInfo")
        for info in totals_data.get("AdditionalInfo", []):
            info_elem = ET.SubElement(additional_info_totals, "Info")
            info_elem.set("Name", info.get("Name", ""))
            if info.get("Data"):
                info_elem.set("Data", str(info.get("Data", "")))
            value = info.get("Value")
            if value is not None:
                info_elem.set("Value", str(value))

        # Payments
        payments_elem = ET.SubElement(root, "Payments")
        for payment in dte_json.get("Payments", []):
            payment_elem = ET.SubElement(payments_elem, "Payment")
            ET.SubElement(payment_elem, "Code").text = payment.get("Code", "")
            ET.SubElement(payment_elem, "Amount").text = str(payment.get("Amount", "0.00"))

            if payment.get("AditionalData"):
                additional_data = ET.SubElement(payment_elem, "AditionalData")
                for info in payment.get("AditionalData", []):
                    info_elem = ET.SubElement(additional_data, "Info")
                    info_elem.set("Name", info.get("Name", ""))
                    if info.get("Data"):
                        info_elem.set("Data", str(info.get("Data", "")))
                    if info.get("Value") is not None:
                        info_elem.set("Value", str(info.get("Value", "")))

        # AdditionalDocumentInfo
        additional_doc = dte_json.get("AdditionalDocumentInfo", {})
        if additional_doc:
            additional_doc_elem = ET.SubElement(root, "AdditionalDocumentInfo")
            additional_info_doc = ET.SubElement(additional_doc_elem, "AdditionalInfo")

            for info in additional_doc.get("AdditionalInfo", []):
                info_elem = ET.SubElement(additional_info_doc, "AditionalData")

                aditional_data = info.get("AditionalData", {})
                if aditional_data:
                    data_container = ET.SubElement(info_elem, "AditionalData")
                    for data in aditional_data.get("Data", []):
                        data_elem = ET.SubElement(data_container, "Data")
                        data_elem.set("Name", data.get("Name", ""))
                        for item_info in data.get("Info", []):
                            item_info_elem = ET.SubElement(data_elem, "Info")
                            item_info_elem.set("Name", item_info.get("Name", ""))
                            if item_info.get("Data"):
                                item_info_elem.set("Data", str(item_info.get("Data", "")))
                            if item_info.get("Value") is not None:
                                item_info_elem.set("Value", str(item_info.get("Value", "")))

        # Indent and format XML
        xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent="    ")
        # Remove extra blank lines
        xml_str = "\n".join([line for line in xml_str.split("\n") if line.strip()])
        return xml_str

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
