-- MySQL Workbench Forward Engineering

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -----------------------------------------------------
-- Schema resource_centre_db
-- -----------------------------------------------------
DROP SCHEMA IF EXISTS `resource_centre_db` ;

-- -----------------------------------------------------
-- Schema resource_centre_db
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `resource_centre_db` DEFAULT CHARACTER SET utf8 ;
USE `resource_centre_db` ;

-- -----------------------------------------------------
-- Table `resource_centre_db`.`school`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`school` (
  `school_id` CHAR(5) NOT NULL,
  `school_name` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`school_id`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`user`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`user` (
  `user_id` INT NOT NULL,
  `school_id` CHAR(5) NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('student', 'admin') NOT NULL,
  PRIMARY KEY (`user_id`),
  INDEX `fk_users_school1_idx` (`school_id` ASC) VISIBLE,
  CONSTRAINT `fk_users_school1`
    FOREIGN KEY (`school_id`)
    REFERENCES `resource_centre_db`.`school` (`school_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`laptop_model`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`laptop_model` (
  `model_id` INT NOT NULL AUTO_INCREMENT,
  `brand` VARCHAR(45) NOT NULL,
  `model_name` VARCHAR(100) NOT NULL,
  `cpu` VARCHAR(100) NOT NULL,
  `ram` INT NOT NULL,
  `storage` INT NOT NULL,
  `graphics_type` ENUM('integrated', 'dedicated') NOT NULL,
  `image_url` VARCHAR(2000) NOT NULL,
  PRIMARY KEY (`model_id`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`laptop`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`laptop` (
  `laptop_id` INT NOT NULL AUTO_INCREMENT,
  `model_id` INT NOT NULL,
  `asset_id` VARCHAR(20) NOT NULL,
  `serial_no` VARCHAR(100) NOT NULL,
  `status` ENUM('available', 'on loan', 'maintenance') NOT NULL,
  `maint_reason` VARCHAR(250) NULL,
  PRIMARY KEY (`laptop_id`),
  UNIQUE INDEX `asset_id_UNIQUE` (`asset_id` ASC) VISIBLE,
  UNIQUE INDEX `serial_no_UNIQUE` (`serial_no` ASC) VISIBLE,
  INDEX `fk_laptops_laptop_model1_idx` (`model_id` ASC) VISIBLE,
  CONSTRAINT `fk_laptops_laptop_model1`
    FOREIGN KEY (`model_id`)
    REFERENCES `resource_centre_db`.`laptop_model` (`model_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`loan`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`loan` (
  `loan_id` INT NOT NULL AUTO_INCREMENT,
  `laptop_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `borrow_date` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `return_date` DATE NULL,
  PRIMARY KEY (`loan_id`),
  INDEX `fk_loans_users_idx` (`user_id` ASC) VISIBLE,
  INDEX `fk_loans_laptops1_idx` (`laptop_id` ASC) VISIBLE,
  CONSTRAINT `fk_loans_users`
    FOREIGN KEY (`user_id`)
    REFERENCES `resource_centre_db`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_loans_laptops1`
    FOREIGN KEY (`laptop_id`)
    REFERENCES `resource_centre_db`.`laptop` (`laptop_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`fine`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`fine` (
  `fine_id` INT NOT NULL AUTO_INCREMENT,
  `loan_id` INT NOT NULL,
  `amount_paid` DECIMAL NOT NULL,
  `is_paid` TINYINT NOT NULL,
  `paid_at` DATETIME NULL,
  PRIMARY KEY (`fine_id`),
  INDEX `fk_fines_loans1_idx` (`loan_id` ASC) VISIBLE,
  UNIQUE INDEX `loanId_UNIQUE` (`loan_id` ASC) VISIBLE,
  CONSTRAINT `fk_fines_loans1`
    FOREIGN KEY (`loan_id`)
    REFERENCES `resource_centre_db`.`loan` (`loan_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`school_has_laptop_model`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`school_has_laptop_model` (
  `school_id` CHAR(5) NOT NULL,
  `model_id` INT NOT NULL,
  PRIMARY KEY (`school_id`, `model_id`),
  INDEX `fk_school_has_laptop_model_laptop_model1_idx` (`model_id` ASC) VISIBLE,
  INDEX `fk_school_has_laptop_model_school1_idx` (`school_id` ASC) VISIBLE,
  CONSTRAINT `fk_school_has_laptop_model_school1`
    FOREIGN KEY (`school_id`)
    REFERENCES `resource_centre_db`.`school` (`school_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_school_has_laptop_model_laptop_model1`
    FOREIGN KEY (`model_id`)
    REFERENCES `resource_centre_db`.`laptop_model` (`model_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`loan_request`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`loan_request` (
  `request_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `model_id` INT NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `request_datetime` DATETIME NOT NULL,
  `status` ENUM('approved', 'rejected', 'pending') NOT NULL,
  `reviewed_by` INT NULL,
  `reviewed_at` DATETIME NULL,
  `remarks` VARCHAR(500) NULL,
  PRIMARY KEY (`request_id`),
  INDEX `fk_loan_request_user1_idx` (`user_id` ASC) VISIBLE,
  INDEX `fk_loan_request_user2_idx` (`reviewed_by` ASC) VISIBLE,
  INDEX `fk_loan_request_laptop_model1_idx` (`model_id` ASC) VISIBLE,
  CONSTRAINT `fk_loan_request_user1`
    FOREIGN KEY (`user_id`)
    REFERENCES `resource_centre_db`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_loan_request_user2`
    FOREIGN KEY (`reviewed_by`)
    REFERENCES `resource_centre_db`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_loan_request_laptop_model1`
    FOREIGN KEY (`model_id`)
    REFERENCES `resource_centre_db`.`laptop_model` (`model_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`notification`
-- Backs the navbar bell + Notifications page (event-driven notifications).
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`notification` (
  `notification_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `message` VARCHAR(500) NOT NULL,
  `is_read` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  INDEX `fk_notification_user_idx` (`user_id` ASC) VISIBLE,
  CONSTRAINT `fk_notification_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `resource_centre_db`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;

-- Sample data
INSERT INTO school (school_id, school_name) VALUES
('SAS', 'School of Applied Science'),
('SEG', 'School of Engineering'),
('SOH', 'School of Hospitality'),
('SOI', 'School of Infocomm'),
('SBZ', 'School of Business'),
('SSH', 'School of Sports and Health'),
('STA', 'School of Technology for Arts, Media and Design');

-- password_hash values are bcrypt hashes (cost 10). The plaintext login
-- password for each user is shown in the comment beside it.
INSERT INTO user
(user_id, school_id, name, email, password_hash, role)
VALUES
(1, 'SBZ', 'May Poe Khitt', '25038034@myrp.edu.sg', '$2b$10$SOYEc//l.6FyKnpVb/HkTuPVJ.W3cOSZJsNikrgmLvq/9dgNhg.Pm', 'student'),   -- hash1
(2, 'SOI', 'Lin Htut Win', '25038212@myrp.edu.sg', '$2b$10$1Sl/A8QPtEezLRZnUmRZP.Mw5i9PaqdVKM82dUhDumH7fQxKwG8I6', 'student'),        -- hash2
(3, 'SEG', 'Cindy Ng', 'cindy@rp.edu.sg', '$2b$10$UZbcGwX7I6NuDtWu.Np24Oi6PJFiGhOPn6jfdxai9n5pLclkXio0m', 'student'),     -- hash3
(4, NULL, 'Bernard Leong', 'bernard_leong@rp.edu.sg', '$2b$10$O1bQQOj3YNgjFjaGrQPRquGeFxo4/pMjHG0fiVwV6UJRlXWi1P6wu', 'admin'),      -- hash4
(5, 'SOH', 'Thiha Aung', '25036723@myrp.edu.sg', '$2b$10$9WBLIMnlnZlFemu0HqP54OIH0UJtlV1IOM/olyMuRTGYoAwzzujby', 'student'),    -- hash5
(6, 'SAS', 'Sim Lewin', '25049276@myrp.edu.sg', '$2b$10$KTHVXwpc6yb.gyl.ZfTM3e1BtxZh9KSkOCwmX4hvKPpC.dJAi135K', 'student'),  -- hash6
(7, 'STA', 'Steffi Tee Yi Hue', '25034408@myrp.edu.sg', '$2b$10$cT0phQxjLabjZKeZIVwm3.g8KCMndBnyALwt..V3zOg74XXuCCLrS', 'student'),    -- hash7
(8, 'SSH', 'Paul Chin', '25031330@myrp.edu.sg', '$2b$10$JsrmeZv3CslmmQ2m2XWMJ.vG5V1IisLeM7Ywpv4bHpBwD2xixaCR6', 'student'),-- hash8
(9, NULL, 'Irene Lim', 'irene@rp.edu.sg', '$2b$10$1yHBiPZ1Nwfa2WcQn.27pO1p1.ZqEBUNiDCcCdqtZDhherpmxaTzG', 'admin');       -- hash9

INSERT INTO laptop_model
(model_id, brand, model_name, cpu, ram, storage, graphics_type, image_url)
VALUES
(1, 'Dell', 'Latitude 5420', 'Intel Core i5-1145G7', 16, 512, 'integrated',
'https://i.dell.com/is/image/DellContent//content/dam/ss2/product-images/dell-client-products/notebooks/latitude-notebooks/14-5420/media-gallery/la5420nt_cnb_00000ff090_gy_5000x5000_gettyimages-1254825733.psd?fmt=png-alpha'),

(2, 'HP', 'EliteBook 840', 'Intel Core i7-1165G7', 16, 512, 'integrated',
'https://sg-media.apjonlinecdn.com/catalog/product/cache/74c1057f7991b4edb2bc7bdaa94de933/c/0/c08942876.png'),

(3, 'Lenovo', 'ThinkPad T14', 'Intel Core i5-10310U', 8, 256, 'integrated',
'https://m.media-amazon.com/images/I/61JdrHr55gL.jpg'),

(4, 'ASUS', 'Vivobook 15', 'Intel Core i5-1135G7', 16, 512, 'dedicated',
'https://dlcdnwebimgs.asus.com/gain/8617ecd5-fff6-45e2-96ba-30cc77623e18/'),

(5, 'Acer', 'Swift 3', 'AMD Ryzen 5 5500U', 8, 512, 'integrated',
'https://m.media-amazon.com/images/I/714yUgq-mDL.jpg');

INSERT INTO laptop
(laptop_id, model_id, asset_id, serial_no, status, maint_reason)
VALUES
(1, 1, 'LAP001', 'DL5420A001', 'available', NULL),
(2, 1, 'LAP002', 'DL5420A002', 'on loan', NULL),
(3, 1, 'LAP003', 'DL5420A003', 'maintenance', 'Battery replacement'),

(4, 2, 'LAP004', 'HP840A001', 'available', NULL),
(5, 2, 'LAP005', 'HP840A002', 'available', NULL),

(6, 3, 'LAP006', 'LNT14A001', 'on loan', NULL),
(7, 3, 'LAP007', 'LNT14A002', 'available', NULL),

(8, 4, 'LAP008', 'ASV15A001', 'maintenance', 'Screen replacement'),

(9, 5, 'LAP009', 'ACS3A001', 'available', NULL),
(10, 5, 'LAP010', 'ACS3A002', 'available', NULL);



INSERT INTO school_has_laptop_model (school_id, model_id) VALUES
-- Entry-level laptops
('SBZ', 1),
('SOH', 1),
('SSH', 1),

('SBZ', 5),
('SOH', 5),
('SSH', 5),

-- Applied Science
('SAS', 2),
('SAS', 3),
('SAS', 5),

-- Infocomm
('SOI', 2),
('SOI', 3),
('SOI', 4),

-- Engineering
('SEG', 2),
('SEG', 3),
('SEG', 4),

-- Arts, Media & Design
('STA', 2),
('STA', 3),
('STA', 4);

INSERT INTO loan_request
(request_id, user_id, model_id, reason, request_datetime, status, reviewed_by, reviewed_at, remarks)
VALUES
(1, 1, 2, 'Need for programming assignments and VM work', '2026-07-01 10:00:00', 'approved', 4, '2026-07-01 12:00:00', 'Approved for coursework'),
(2, 2, 4, 'Video editing project for module', '2026-07-01 10:15:00', 'approved', 4, '2026-07-01 12:10:00', 'High priority module'),
(3, 3, 3, 'Engineering simulation software usage', '2026-07-02 09:00:00', 'pending', NULL, NULL, NULL),
(4, 5, 1, 'General coursework and research', '2026-07-02 09:30:00', 'rejected', 4, '2026-07-02 10:00:00', 'Insufficient stock at the moment');

INSERT INTO loan
(loan_id, laptop_id, user_id, borrow_date, due_date, return_date)
VALUES
(1, 2, 1, '2026-07-01', '2026-07-08', NULL),
(2, 6, 2, '2026-07-01', '2026-07-08', NULL);