/*
  The custom REST API to support the app frontend.
  Handlers combine application data from qr-codes-db.js with helpers to merge the Shopify GraphQL Admin API data.
  The Shop is the Shop that the current user belongs to. For example, the shop that is using the app.
  This information is retrieved from the Authorization header, which is decoded from the request.
  The authorization header is added by App Bridge in the frontend code.
*/

import express from "express";

import shopify from "../shopify.js";
import { QRCodesDB } from "../qr-codes-db.js";
import {
	getQrCodeOr404,
	getShopUrlFromSession,
	parseQrCodeBody,
	formatQrCodeResponse,
} from "../helpers/qr-codes.js";

const DISCOUNTS_QUERY = `
  query discounts($first: Int!) {
    codeDiscountNodes(first: $first) {
      edges {
        node {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
            ... on DiscountCodeBxgy {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
            ... on DiscountCodeFreeShipping {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY = `
query {
  products (first: 2) {
    edges {
      node {
        id
        title
        handle
      }
    }
  }
}
`;

const EDIT_QUERY = `
mutation {
  productUpdate(input: {id: "gid://shopify/Product/8119976460596", title: "WAZAA"}) {
    product {
      id
      title
    }
  }
}
`;

export default function applyQrCodeApiEndpoints(app) {
	app.use(express.json());

	app.get("/api/discounts", async (req, res) => {
		const client = new shopify.api.clients.Graphql({
			session: res.locals.shopify.session,
		});

		/* Fetch all available discounts to list in the QR code form */
		const discounts = await client.query({
			data: {
				query: DISCOUNTS_QUERY,
				variables: {
					first: 25,
				},
			},
		});

		res.send(discounts.body.data);
	});

	app.get("/api/products", async (req, res) => {
		const client = new shopify.api.clients.Graphql({
			session: res.locals.shopify.session,
		});

		const products = await client.query({
			data: {
				query: PRODUCTS_QUERY,
			},
		});

		res.send(products.body.data);
	});

	app.patch("/api/products/edit", async (req, res) => {
		console.log(req.body.RAK);

		const client = new shopify.api.clients.Graphql({
			session: res.locals.shopify.session,
		});

		const products = await client.query({
			data: {
				query: `
        mutation {
          productUpdate(input: {id: "gid://shopify/Product/8119976460596", title: "${req.body.RAK}"}) {
            product {
              id
              title
            }
          }
        }
        `,
			},
		});

		res.send(products.body.data);
	});

	app.patch("/api/products/add-metafield", async (req, res) => {
		console.log(req.body.RAK);

		const client = new shopify.api.clients.Graphql({
			session: res.locals.shopify.session,
		});

		const products = await client.query({
			data: {
				query: `mutation updateProductMetafields($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              metafields(first: 3) {
                edges {
                  node {
                    namespace
                    key
                    value
                  }
                }
              }
            }
            userErrors {
              message
              field
            }
          }
        }`,
				variables: {
					input: {
						metafields: [
							{
								namespace: "my_field",
								key: "liner_material",
								type: "single_line_text_field",
								value: "Synthetic Leather",
							},
						],
						id: "gid://shopify/Product/8119976460596",
					},
				},
			},
		});

		res.send(products.body.data);
	});

	app.patch("/api/products/edit-metafield", async (req, res) => {
		console.log(req.body.RAK);

		const client = new shopify.api.clients.Graphql({
			session: res.locals.shopify.session,
		});

		const products = await client.query({
			data: {
				query: `mutation updateProductMetafields($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              metafields(first: 3) {
                edges {
                  node {
                    namespace
                    key
                    value
                    id
                  }
                }
              }
            }
            userErrors {
              message
              field
            }
          }
        }`,
				variables: {
					input: {
						metafields: [
							{
								namespace: "my_field",
								key: "liner_material",
								type: "single_line_text_field",
								value: "Synthetic Leather",
							},
						],
						id: "gid://shopify/Product/8119976460596",
					},
				},
			},
		});

		res.send(products.body.data);
	});

	app.post("/api/products/tests", async (req, res) => {
		console.log(req.body.RAK);

		const client = new shopify.api.clients.Graphql({
			session: res.locals.shopify.session,
		});

		const products = await client.query({
			data: {
				query: `
        mutation {
          productUpdate(input: {id: "gid://shopify/Product/8119976460596", title: "${req.body.RAK}"}) {
            product {
              id
              title
            }
          }
        }
        `,
			},
		});

		res.send(products.body.data);
	});

	app.post("/api/qrcodes", async (req, res) => {
		try {
			const id = await QRCodesDB.create({
				...(await parseQrCodeBody(req)),

				/* Get the shop from the authorization header to prevent users from spoofing the data */
				shopDomain: await getShopUrlFromSession(req, res),
			});
			const response = await formatQrCodeResponse(req, res, [await QRCodesDB.read(id)]);
			res.status(201).send(response[0]);
		} catch (error) {
			res.status(500).send(error.message);
		}
	});

	app.patch("/api/qrcodes/:id", async (req, res) => {
		const qrcode = await getQrCodeOr404(req, res);

		console.log(req.body);

		if (qrcode) {
			try {
				await QRCodesDB.update(req.params.id, await parseQrCodeBody(req));
				const response = await formatQrCodeResponse(req, res, [
					await QRCodesDB.read(req.params.id),
				]);
				res.status(200).send(response[0]);
			} catch (error) {
				res.status(500).send(error.message);
			}
		}
	});

	app.get("/api/qrcodes", async (req, res) => {
		try {
			const rawCodeData = await QRCodesDB.list(await getShopUrlFromSession(req, res));

			const response = await formatQrCodeResponse(req, res, rawCodeData);
			res.status(200).send(response);
		} catch (error) {
			console.error(error);
			res.status(500).send(error.message);
		}
	});

	app.get("/api/qrcodes/:id", async (req, res) => {
		const qrcode = await getQrCodeOr404(req, res);

		if (qrcode) {
			const formattedQrCode = await formatQrCodeResponse(req, res, [qrcode]);
			res.status(200).send(formattedQrCode[0]);
		}
	});

	app.delete("/api/qrcodes/:id", async (req, res) => {
		const qrcode = await getQrCodeOr404(req, res);

		if (qrcode) {
			await QRCodesDB.delete(req.params.id);
			res.status(200).send();
		}
	});
}
