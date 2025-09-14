import {
	describe, it, expect, beforeEach,
	afterEach,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {type INotificationService} from '../notifications.port.js';
import {createDatabaseMock, cleanUp} from '../../utils/test-utils/database-tools.ts.js';
import {ProductService} from './product.service.js';
import {products, type Product} from '@/db/schema.js';
import {type Database, type sqliteDatabase} from '@/db/type.js';
const day = 24 * 60 * 60 * 1000;
describe('ProductService Tests', () => {
	let notificationServiceMock: DeepMockProxy<INotificationService>;
	let productService: ProductService;
	let databaseMock: Database;
	let databaseName: string;
	let sqlite: sqliteDatabase;

	beforeEach(async () => {
		({databaseMock, databaseName, sqlite} = await createDatabaseMock());
		notificationServiceMock = mockDeep<INotificationService>();
		productService = new ProductService({
			ns: notificationServiceMock,
			db: databaseMock,
		});
	});

	afterEach(async () => {
		sqlite.close()
		cleanUp(databaseName)
	}
	);

	it('should handle delay notification correctly', async () => {
		// GIVEN
		const product: Product = {
			id: 1,
			leadTime: 15,
			available: 0,
			type: 'NORMAL',
			name: 'RJ45 Cable',
			expiryDate: null,
			seasonStartDate: null,
			seasonEndDate: null,
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await productService.notifyDelay(product.leadTime, product);

		// THEN
		expect(product.available).toBe(0);
		expect(product.leadTime).toBe(15);
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(product.leadTime, product.name);
		const result = await databaseMock.query.products.findFirst({
			where: (product, {eq}) => eq(product.id, product.id),
		});
		expect(result).toEqual(product);
	});

	it('should handle Seasonal Product not available due to leadTime exceeding seasonEndDate', async () => {
		// GIVEN
		const product: Product = {
			id: 2,
			leadTime: 10,
			available: 0,
			type: 'SEASONAL',
			name: 'Lemon',
			expiryDate: null,
			seasonStartDate: new Date(Date.now() - (2 * day)),
			seasonEndDate: new Date(Date.now() + (2 * day)),
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await productService.handleSeasonalProduct(product);

		// THEN
		expect(product.available).toBe(0);
		expect(product.leadTime).toBe(10);
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith(product.name);
		const result = await databaseMock.query.products.findFirst({
			where: (product, {eq}) => eq(product.id, product.id),
		});
		expect(result).toEqual(product);
	});

	it('should handle Seasonal Product not available due to seasonStartDate not yet reached', async () => {
		// GIVEN
		const product: Product = {
			id: 3,
			leadTime: 10,
			available: 0,
			type: 'SEASONAL',
			name: 'Lemon',
			expiryDate: null,
			seasonStartDate: new Date(Date.now() + (8 * day)),
			seasonEndDate: new Date(Date.now() + (50 * day)),
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await productService.handleSeasonalProduct(product);

		// THEN
		expect(product.available).toBe(0);
		expect(product.leadTime).toBe(10);
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith(product.name);
		const result = await databaseMock.query.products.findFirst({
			where: (product, {eq}) => eq(product.id, product.id),
		});
		expect(result).toEqual(product);
	});

	it('should handle delay notification for Seasonal Product available after reaching leadTime', async () => {
		// GIVEN
		const product: Product = {
			id: 4,
			leadTime: 10,
			available: 0,
			type: 'SEASONAL',
			name: 'Lemon',
			expiryDate: null,
			seasonStartDate: new Date(Date.now() - (1 * day)),
			seasonEndDate: new Date(Date.now() + (30 * day)),
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await productService.handleSeasonalProduct(product);

		// THEN
		expect(product.available).toBe(0);
		expect(product.leadTime).toBe(10);
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(product.leadTime, product.name);
		const result = await databaseMock.query.products.findFirst({
			where: (product, {eq}) => eq(product.id, product.id),
		});
		expect(result).toEqual(product);
	});

	it('should handle Product expiration in case the product is NOT expired', async () => {
		// GIVEN
		const product: Product = {
			id: 5,
			leadTime: 10,
			available: 2,
			type: 'EXPIRABLE',
			name: 'Bread',
			expiryDate: new Date(Date.now() + (5 * day)),
			seasonStartDate: null,
			seasonEndDate: null,
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await productService.handleExpiredProduct(product);

		// THEN
		expect(product.available).toBe(1);
		expect(product.leadTime).toBe(10);
		const result = await databaseMock.query.products.findFirst({
			where: (product, {eq}) => eq(product.id, product.id),
		});
		expect(result!.available).toEqual(1);
	});

	it('should handle Product expiration in case expired', async () => {
		// GIVEN
		const product: Product = {
			id: 6,
			leadTime: 10,
			available: 2,
			type: 'EXPIRABLE',
			name: 'Bread',
			expiryDate: new Date(Date.now() - (5 * day)),
			seasonStartDate: null,
			seasonEndDate: null,
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await productService.handleExpiredProduct(product);

		// THEN
		expect(product.available).toBe(0);
		expect(product.leadTime).toBe(10);
		expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith(product.name, product.expiryDate);
		const result = await databaseMock.query.products.findFirst({
			where: (product, {eq}) => eq(product.id, product.id),
		});
		expect(result?.available).toEqual(0);
	});
});

