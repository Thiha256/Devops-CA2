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
-- Table `resource_centre_db`.`users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`users` (
  `user_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('student', 'admin') NOT NULL,
  PRIMARY KEY (`user_id`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`laptops`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`laptops` (
  `laptop_id` INT NOT NULL AUTO_INCREMENT,
  `brand` VARCHAR(45) NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  `cpu` VARCHAR(100) NOT NULL,
  `ram` INT NOT NULL,
  `storage` INT NOT NULL,
  `graphics_type` ENUM('integrated', 'dedicated') NOT NULL,
  `status` ENUM('available', 'not_available', 'on_loan') NOT NULL,
  `status_reason` VARCHAR(255) NULL,
  `image_url` VARCHAR(5000) NOT NULL, 
  PRIMARY KEY (`laptop_id`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`loans`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`loans` (
  `loan_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `laptop_id` INT NOT NULL,
  `borrow_date` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `return_date` DATE NULL,
  PRIMARY KEY (`loan_id`),
  INDEX `fk_loans_users_idx` (`user_id` ASC) VISIBLE,
  INDEX `fk_loans_laptops1_idx` (`laptop_id` ASC) VISIBLE,
  CONSTRAINT `fk_loans_users`
    FOREIGN KEY (`user_id`)
    REFERENCES `resource_centre_db`.`users` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_loans_laptops1`
    FOREIGN KEY (`laptop_id`)
    REFERENCES `resource_centre_db`.`laptops` (`laptop_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `resource_centre_db`.`fines`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_centre_db`.`fines` (
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
    REFERENCES `resource_centre_db`.`loans` (`loan_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;

-- Sample data
INSERT INTO users (user_id, name, email, password_hash, role) VALUES
(1, 'Alice Tan', 'alice@rp.edu.sg', 'hash1', 'student'),
(2, 'Ben Lim', 'ben@rp.edu.sg', 'hash2', 'student'),
(3, 'Cindy Ng', 'cindy@rp.edu.sg', 'hash3', 'student'),
(4, 'David Wong', 'david@rp.edu.sg', 'hash4', 'admin'),
(5, 'Ethan Koh', 'ethan@rp.edu.sg', 'hash5', 'student');

INSERT INTO laptops (brand, model, cpu, ram, storage, graphics_type, status, status_reason, image_url) VALUES
('Dell', 'Latitude 5420', 'i5-1145G7', 16, 512, 'integrated', 'available', NULL, 'https://i.dell.com/is/image/DellContent//content/dam/ss2/product-images/dell-client-products/notebooks/latitude-notebooks/14-5420/media-gallery/la5420nt_cnb_00000ff090_gy_5000x5000_gettyimages-1254825733.psd?fmt=png-alpha&pscan=auto&scl=1&wid=4659&hei=2676&qlt=100,1&resMode=sharp2&size=4659,2676&chrss=full&imwidth=5000'),
('HP', 'EliteBook 840', 'i7-1165G7', 16, 512, 'integrated', 'on_loan', NULL, 'https://sg-media.apjonlinecdn.com/catalog/product/cache/74c1057f7991b4edb2bc7bdaa94de933/c/0/c08942876.png'),
('Lenovo', 'ThinkPad T14', 'i5-10310U', 8, 256, 'integrated', 'available', NULL,'https://m.media-amazon.com/images/I/61JdrHr55gL.jpg'),
('Asus', 'Vivobook 15', 'i5-1135G7', 16, 512, 'dedicated', 'not_available', 'under_maintenance', 'https://dlcdnwebimgs.asus.com/gain/8617ecd5-fff6-45e2-96ba-30cc77623e18/'),
('Acer', 'Swift 3', 'Ryzen 5 5500U', 8, 512, 'integrated', 'available', NULL, 'https://m.media-amazon.com/images/I/714yUgq-mDL.jpg');
